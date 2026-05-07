const jwt = require('jsonwebtoken')
const sanitizeHtml = require('sanitize-html')
const Session = require('../models/Session')
const Quiz = require('../models/Quiz')
const { processReveal, buildLeaderboard, getVoteStats } = require('../services/quizService')

/**
 * In-memory stores for the duration of a live session.
 *
 * IMPORTANT: These are process-local. If the server restarts mid-session
 * or runs behind a load balancer with multiple instances, live session
 * state will be lost or inconsistent.
 *
 * To support multi-instance deployments, replace these maps with a
 * Redis store (e.g. ioredis + socket.io-redis adapter):
 *   1. Add `socket.io-redis` adapter for socket room broadcasting.
 *   2. Move `liveVotes` and `roomTimers` to Redis with TTL.
 *   3. Move `roomHosts` to Redis as `roomCode → socketId` hash.
 */
const liveVotes = {}      // { "ROOMCODE": { qIndex: [0, 0, 0, 0] } }
const roomHosts = {}      // { "ROOMCODE": socketId }
const roomTimers = {}     // { "ROOMCODE": timeoutRef }
const roomIntervals = {}  // { "ROOMCODE": intervalRef }
const lastAnswerTime = {} // { socketId: timestamp } — answer throttle
const roomEnded = {}      // { "ROOMCODE": true } — set on quiz:end, checked in interval
const MAX_PLAYERS_PER_ROOM = 100

/**
 * Defense-in-depth host authorization.
 * Checks both the socket's own metadata (set at host:join after JWT verification)
 * AND the in-memory roomHosts map. Both must agree.
 */
function isHost(socket, code) {
  return socket.data.isHost === true && roomHosts[code] === socket.id
}

/**
 * Verify the JWT from socket handshake auth and return the decoded payload,
 * or null if missing/invalid.
 *
 * Two sources, in priority order:
 *  1. socket.handshake.auth.token — used by the socket test suite (JWT passed directly)
 *  2. Cookie header — used by browsers after the httpOnly-cookie migration
 */
function verifySocketToken(socket) {
  try {
    const authToken = socket.handshake.auth?.token
    if (authToken) return jwt.verify(authToken, process.env.JWT_SECRET)

    const raw = socket.handshake.headers?.cookie || ''
    const tokenMatch = raw.match(/(?:^|;\s*)token=([^;]+)/)
    if (!tokenMatch) return null

    return jwt.verify(decodeURIComponent(tokenMatch[1]), process.env.JWT_SECRET)
  } catch {
    return null
  }
}

/** Resolve the effective time limit for a question */
function resolveTimeLimit(quiz, questionIndex) {
  if (quiz.timerMode === 'quiz') return quiz.quizTimeLimit
  return quiz.questions[questionIndex].timeLimit
}

function initQuizSocket(io) {
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`)

    // ─────────────────────────────────────────────
    // PLAYER: Join a room
    // ─────────────────────────────────────────────
    socket.on('player:join', async ({ roomCode, playerName, playerId }) => {
      try {
        if (!roomCode || !playerName || !playerId) return

        // Validate playerId — must be a non-empty string under 64 chars
        if (typeof playerId !== 'string' || playerId.trim().length === 0 || playerId.length > 100) {
          return socket.emit('error', { message: 'Invalid player ID' })
        }

        const trimmedName = sanitizeHtml(playerName.trim(), {
          allowedTags: [],
          allowedAttributes: {}
        })
        if (trimmedName.length < 1) {
          return socket.emit('error', { message: 'Player name cannot be empty' })
        }
        if (trimmedName.length > 30) {
          return socket.emit('error', { message: 'Player name cannot exceed 30 characters' })
        }

        const code = roomCode.toUpperCase().trim()
        let session = await Session.findOne({ roomCode: code })

        if (!session) {
          return socket.emit('error', { message: 'Room not found' })
        }
        if (session.status === 'ended') {
          // Instead of erroring, send the final results immediately so the player sees the end screen
          const { buildLeaderboard } = require('../services/quizService')
          const finalLeaderboard = buildLeaderboard(session.players)
          return socket.emit('quiz:ended', {
            finalLeaderboard,
            sessionId: session._id,
          })
        }

        const activePlayers = session.players.filter(p => p.active !== false)
        if (activePlayers.length >= MAX_PLAYERS_PER_ROOM) {
          return socket.emit('error', { message: `This room is full (max ${MAX_PLAYERS_PER_ROOM} players)` })
        }

        // Check if player already exists in the session (reconnect case)
        const existingPlayer = session.players.find(p => p.playerId === playerId)

        if (existingPlayer) {
          // Reconnecting player — reactivate them, preserve their score
          await Session.findOneAndUpdate(
            { roomCode: code, 'players.playerId': playerId },
            { $set: { 'players.$.active': true, 'players.$.name': trimmedName, 'players.$.lastJoinedAt': new Date() } }
          )
          session = await Session.findOne({ roomCode: code })
        } else {
          // New player — push with active: true
          let updatedSession = await Session.findOneAndUpdate(
            { roomCode: code, 'players.playerId': { $ne: playerId } },
            { $push: { players: { playerId, name: trimmedName, score: 0, active: true, lastJoinedAt: new Date() } } },
            { new: true }
          )
          if (!updatedSession) {
            updatedSession = await Session.findOne({ roomCode: code })
          }
          session = updatedSession
        }

        // Join the socket room
        socket.join(code)
        socket.data.roomCode = code
        socket.data.playerId = playerId
        socket.data.isHost = false

        const quiz = await Quiz.findById(session.quizId)

        // Build the current question payload if the session is mid-game
        // (never include correctIndex — same rule as quiz:question broadcast)
        let currentQuestion = null
        if ((session.status === 'live' || session.status === 'revealing') && quiz) {
          const q = quiz.questions[session.currentIndex]
          if (q) {
            const timeLimit = quiz.timerMode === 'quiz' ? quiz.quizTimeLimit : q.timeLimit
            currentQuestion = {
              index: session.currentIndex,
              totalQuestions: quiz.questions.length,
              text: q.text,
              options: q.options,
              timeLimit,
            }
          }
        }

        // Tell the player they're in (include their preserved score on reconnect)
        const playerEntry = session.players.find(p => p.playerId === playerId)
        socket.emit('player:joined', {
          roomCode: code,
          quizTitle: quiz?.title || '',
          status: session.status,
          currentQuestion,
          score: playerEntry?.score || 0,
        })

        // Update host with player list (including active status)
        const hostSocketId = roomHosts[code]
        if (hostSocketId) {
          const activePlayers = session.players.filter(p => p.active !== false)
          io.to(hostSocketId).emit('room:players', {
            count: activePlayers.length,
            players: session.players.map((p) => ({ 
              name: p.name, 
              id: p.playerId,
              active: p.active !== false 
            })),
          })
        }

        console.log(`Player "${trimmedName}" ${existingPlayer ? 'reconnected to' : 'joined'} room ${code}`)
      } catch (err) {
        console.error('player:join error:', err)
        socket.emit('error', { message: 'Failed to join room' })
      }
    })

    // ─────────────────────────────────────────────
    // PLAYER: Leave a room explicitly
    // Mark as inactive instead of removing — preserves score for reconnection
    // ─────────────────────────────────────────────
    socket.on('player:leave', async ({ roomCode, playerId }) => {
      try {
        if (!roomCode || !playerId) return
        const code = roomCode.toUpperCase().trim()
        
        socket.leave(code)

        // Mark player as inactive (don't remove — preserves score)
        const session = await Session.findOneAndUpdate(
          { roomCode: code, 'players.playerId': playerId },
          { $set: { 'players.$.active': false } },
          { new: true }
        )

        if (session) {
          console.log(`Player left room ${code} (marked inactive)`)
          // Update host with player list (including active status)
          const hostSocketId = roomHosts[code]
          if (hostSocketId) {
            const activePlayers = session.players.filter(p => p.active !== false)
            io.to(hostSocketId).emit('room:players', {
              count: activePlayers.length,
              players: session.players.map((p) => ({ 
                name: p.name, 
                id: p.playerId,
                active: p.active !== false 
              })),
            })
          }
        }
      } catch (err) {
        console.error('player:leave error:', err)
      }
    })

    // ─────────────────────────────────────────────
    // HOST: Join their own session room
    // ─────────────────────────────────────────────
    socket.on('host:join', async ({ roomCode }) => {
      try {
        if (!roomCode) return

        // Verify the JWT from the socket handshake
        const decoded = verifySocketToken(socket)
        if (!decoded) {
          return socket.emit('error', { message: 'Authentication required' })
        }

        const code = roomCode.toUpperCase().trim()
        const session = await Session.findOne({ roomCode: code })

        if (!session) {
          return socket.emit('error', { message: 'Session not found' })
        }

        // Confirm the authenticated user actually owns this session
        if (session.hostId.toString() !== decoded.id) {
          return socket.emit('error', { message: 'Not authorised to host this session' })
        }

        socket.join(code)
        socket.data.roomCode = code
        socket.data.isHost = true
        socket.data.hostId = decoded.id
        roomHosts[code] = socket.id

        const quiz = await Quiz.findById(session.quizId)

        let currentQuestion = null
        if ((session.status === 'live' || session.status === 'revealing') && quiz) {
          const q = quiz.questions[session.currentIndex]
          if (q) {
            const timeLimit = resolveTimeLimit(quiz, session.currentIndex)
            currentQuestion = {
              index: session.currentIndex,
              totalQuestions: quiz.questions.length,
              text: q.text,
              options: q.options,
              timeLimit,
            }
          }
        }

        socket.emit('host:joined', {
          roomCode: code,
          status: session.status,
          players: session.players.map((p) => ({ 
            name: p.name, 
            id: p.playerId,
            active: p.active !== false
          })),
          currentQuestion,
        })

        console.log(`Host joined room ${code}`)
      } catch (err) {
        console.error('host:join error:', err)
        socket.emit('error', { message: 'Failed to join as host' })
      }
    })

    // ─────────────────────────────────────────────
    // HOST: Start the quiz
    // ─────────────────────────────────────────────
    socket.on('quiz:start', async ({ roomCode }) => {
      try {
        const code = roomCode?.toUpperCase()
        if (!isHost(socket, code)) return

        // Atomically transition status from 'waiting' → 'live'.
        // The status filter ensures only one concurrent call succeeds —
        // if two quiz:start events fire simultaneously, only one will match
        // the 'waiting' document; the other gets null and exits silently.
        const session = await Session.findOneAndUpdate(
          { roomCode: code, status: 'waiting' },
          { $set: { status: 'live', currentIndex: 0, startedAt: new Date(), questionOpenedAt: new Date() } },
          { new: true }
        )

        if (!session) return  // already started, or room doesn't exist

        const quiz = await Quiz.findById(session.quizId)
        if (!quiz || quiz.questions.length === 0) {
          return socket.emit('error', { message: 'Quiz has no questions' })
        }

        // Init vote tracker for question 0
        const q = quiz.questions[0]
        liveVotes[code] = { 0: new Array(q.options.length).fill(0) }

        // Resolve effective time limit — quiz-wide or per-question
        const timeLimit = quiz.timerMode === 'quiz' ? quiz.quizTimeLimit : q.timeLimit

        // Broadcast first question to players (no correctIndex!)
        const questionPayload = {
          index: 0,
          totalQuestions: quiz.questions.length,
          text: q.text,
          options: q.options,
          timeLimit,
        }

        io.to(code).emit('quiz:question', questionPayload)

        // Start server-side countdown timer
        startQuestionTimer(io, code, session, quiz, timeLimit)

        console.log(`Quiz started in room ${code}`)
      } catch (err) {
        console.error('quiz:start error:', err)
      }
    })

    // ─────────────────────────────────────────────
    // PLAYER: Submit an answer
    // ─────────────────────────────────────────────
    socket.on('player:answer', async ({ roomCode, questionIndex, optionIndex, playerId }) => {
      try {
        // Answer throttle — ignore duplicate fires within 500ms
        const now = Date.now()
        if (lastAnswerTime[socket.id] && now - lastAnswerTime[socket.id] < 500) return
        lastAnswerTime[socket.id] = now

        const code = roomCode?.toUpperCase()

        // Validate inputs
        const session = await Session.findOne({ roomCode: code })
        if (!session) return
        if (session.status !== 'live') return
        if (session.currentIndex !== questionIndex) return  // wrong question

        // Validate optionIndex against the actual question
        const quiz = await Quiz.findById(session.quizId)
        if (!Number.isInteger(questionIndex) || questionIndex < 0) return
        const question = quiz.questions[questionIndex]
        if (!question || !Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= question.options.length) return

        // Atomically push the response only if this player hasn't answered this question yet.
        // The compound condition on the $push prevents duplicates without a separate read.
        const updated = await Session.findOneAndUpdate(
          {
            roomCode: code,
            status: 'live',
            currentIndex: questionIndex,
            'responses': {
              $not: {
                $elemMatch: { playerId, questionIndex }
              }
            }
          },
          {
            $push: {
              responses: {
                playerId,
                questionIndex,
                optionIndex,
                isCorrect: false,  // updated at reveal
                pointsAwarded: 0,      // updated at reveal
                answeredAt: new Date(),
              }
            }
          },
          { new: true }
        )

        // null means either already answered, or session state changed — either way, bail
        if (!updated) return

        // Update in-memory vote counter
        if (!liveVotes[code]) liveVotes[code] = {}
        if (!liveVotes[code][questionIndex]) liveVotes[code][questionIndex] = new Array(question.options.length).fill(0)
        liveVotes[code][questionIndex][optionIndex]++

        const hostSocketId = roomHosts[code]
        if (hostSocketId) {
          const votes = liveVotes[code][questionIndex]
          io.to(hostSocketId).emit('quiz:stats', {
            votes,
            totalAnswered: votes.reduce((s, v) => s + v, 0),
            totalPlayers: updated.players.filter(p => p.active !== false).length,
          })
        }

        // Acknowledge to player that answer was received
        socket.emit('answer:received', { questionIndex, optionIndex })
      } catch (err) {
        console.error('player:answer error:', err)
      }
    })

    // ─────────────────────────────────────────────
    // HOST: Reveal answer and calculate scores
    // ─────────────────────────────────────────────
    socket.on('quiz:reveal', async ({ roomCode }) => {
      try {
        const code = roomCode?.toUpperCase()
        if (!isHost(socket, code)) return

        const session = await Session.findOne({ roomCode: code })
        if (!session || session.status !== 'live') return

        const quiz = await Quiz.findById(session.quizId)

        // Clear the auto-advance timer
        clearQuestionTimer(code)

        // Set status to revealing
        session.status = 'revealing'
        await session.save()

        // Calculate scores and build leaderboard
        const timeLimit = resolveTimeLimit(quiz, session.currentIndex)
        const { correctIndex, votes, leaderboard, pointsMap } = await processReveal(session, quiz, timeLimit)

        // Broadcast reveal to everyone in the room
        io.to(code).emit('quiz:result', {
          correctIndex,
          votes,
          leaderboard,
          pointsMap,    // { [playerId]: pointsAwarded } — each client reads their own entry
          questionIndex: session.currentIndex,
        })

        console.log(`Revealed question ${session.currentIndex} in room ${code}`)
      } catch (err) {
        console.error('quiz:reveal error:', err)
      }
    })

    // ─────────────────────────────────────────────
    // HOST: Advance to next question
    // ─────────────────────────────────────────────
    socket.on('quiz:next', async ({ roomCode }) => {
      try {
        const code = roomCode?.toUpperCase()
        if (!isHost(socket, code)) return

        const session = await Session.findOne({ roomCode: code })
        if (!session || session.status !== 'revealing') return

        const quiz = await Quiz.findById(session.quizId)
        const nextIndex = session.currentIndex + 1

        if (nextIndex >= quiz.questions.length) {
          return socket.emit('error', { message: 'No more questions. Use quiz:end to finish.' })
        }

        // Advance to next question
        session.currentIndex = nextIndex
        session.status = 'live'
        session.questionOpenedAt = new Date()
        await session.save()

        const q = quiz.questions[nextIndex]
        if (!liveVotes[code]) liveVotes[code] = {}
        liveVotes[code][nextIndex] = new Array(q.options.length).fill(0)

        // Resolve effective time limit — quiz-wide or per-question
        const timeLimit = quiz.timerMode === 'quiz' ? quiz.quizTimeLimit : q.timeLimit

        const questionPayload = {
          index: nextIndex,
          totalQuestions: quiz.questions.length,
          text: q.text,
          options: q.options,
          timeLimit,
        }

        io.to(code).emit('quiz:question', questionPayload)

        // Restart timer for new question
        startQuestionTimer(io, code, session, quiz, timeLimit)

        console.log(`Advanced to question ${nextIndex} in room ${code}`)
      } catch (err) {
        console.error('quiz:next error:', err)
      }
    })

    // ─────────────────────────────────────────────
    // HOST: End the session
    // ─────────────────────────────────────────────
    socket.on('quiz:end', async ({ roomCode }) => {
      try {
        const code = roomCode?.toUpperCase()
        if (!isHost(socket, code)) return

        roomEnded[code] = true      // set flag immediately
        clearQuestionTimer(code)    // belt-and-suspenders (cleanupRoom will also clear)

        const session = await Session.findOne({ roomCode: code })
        if (!session) return

        session.status = 'ended'
        session.endedAt = new Date()
        await session.save()

        const finalLeaderboard = buildLeaderboard(session.players)

        io.to(code).emit('quiz:ended', {
          finalLeaderboard,
          sessionId: session._id,
        })

        // Cleanup in-memory stores
        cleanupRoom(io, code)
        console.log(`Session ended in room ${code}`)
      } catch (err) {
        console.error('quiz:end error:', err)
      }
    })

    // ─────────────────────────────────────────────
    // HOST: Cancel the session entirely
    // Broadcasts cancellation to players first, then deletes
    // the session from DB and cleans up in-memory state.
    // ─────────────────────────────────────────────
    socket.on('host:cancel', async ({ roomCode }) => {
      try {
        const code = roomCode?.toUpperCase()
        if (!isHost(socket, code)) return

        // Notify players before deleting — they need the event to redirect
        io.to(code).emit('session_canceled')

        // Delete the session from the database entirely
        await Session.deleteOne({ roomCode: code })

        cleanupRoom(io, code)
        console.log(`Session canceled and deleted in room ${code}`)
      } catch (err) {
        console.error('host:cancel error:', err)
      }
    })

    // ─────────────────────────────────────────────
    // Disconnect cleanup
    // ─────────────────────────────────────────────
    socket.on('disconnect', () => {
      const code = socket.data.roomCode

      // Clean up answer throttle
      delete lastAnswerTime[socket.id]

      if (socket.data.isHost && code) {
        // Notify players that host disconnected
        socket.to(code).emit('host:disconnected', {
          message: 'Host disconnected. The session may resume shortly.',
        })
      }

      if (!socket.data.isHost && code && socket.data.playerId) {
        const disconnectedAt = new Date()
        // Mark player as inactive in DB ONLY if they haven't rejoined since this disconnect event fired.
        // This prevents a race condition where a slow disconnect DB call overwrites a fast reconnect.
        Session.findOneAndUpdate(
          { 
            roomCode: code, 
            'players.playerId': socket.data.playerId,
            'players.lastJoinedAt': { $lt: disconnectedAt }
          },
          { $set: { 'players.$.active': false } },
          { new: true }
        ).then(session => {
          if (session) {
            const hostSocketId = roomHosts[code]
            if (hostSocketId) {
              const activePlayers = session.players.filter(p => p.active !== false)
              io.to(hostSocketId).emit('room:players', {
                count: activePlayers.length,
                players: session.players.map((p) => ({ 
                  name: p.name, 
                  id: p.playerId,
                  active: p.active !== false 
                })),
              })
            }
          }
        }).catch(err => console.error('Disconnect cleanup error:', err))
      }

      console.log(`Socket disconnected: ${socket.id}`)
    })
  })
}

// ─────────────────────────────────────────────
// Timer helpers
// ─────────────────────────────────────────────

function startQuestionTimer(io, code, session, quiz, timeLimit) {
  clearQuestionTimer(code)
  delete roomEnded[code]

  let remaining = timeLimit

  // Emit a tick every second
  roomIntervals[code] = setInterval(() => {
    if (roomEnded[code]) {
      clearInterval(roomIntervals[code])
      return
    }

    remaining--
    io.to(code).emit('timer:tick', { remaining })

    if (remaining <= 0) {
      clearInterval(roomIntervals[code])
    }
  }, 1000)

  // Auto-reveal when time is up
  roomTimers[code] = setTimeout(async () => {
    clearInterval(roomIntervals[code])
    if (roomEnded[code]) return

    try {
      // Reload session to get latest state
      const freshSession = await Session.findOne({ roomCode: code })
      if (!freshSession || freshSession.status !== 'live') return

      freshSession.status = 'revealing'
      await freshSession.save()

      const { correctIndex, votes, leaderboard, pointsMap } = await processReveal(freshSession, quiz, timeLimit)

      io.to(code).emit('quiz:result', {
        correctIndex,
        votes,
        leaderboard,
        pointsMap,
        questionIndex: freshSession.currentIndex,
        autoRevealed: true,
      })
    } catch (err) {
      console.error('Auto-reveal error:', err)
    }
  }, timeLimit * 1000)
}

function clearQuestionTimer(code) {
  if (roomTimers[code]) {
    clearTimeout(roomTimers[code])
    delete roomTimers[code]
  }
  if (roomIntervals[code]) {
    clearInterval(roomIntervals[code])
    delete roomIntervals[code]
  }
}

function cleanupRoom(io, code) {
  if (!code) return
  try {
    // 1. Set the flag first — blocks any in-flight interval/timeout callbacks
    roomEnded[code] = true

    // 2. Explicitly clear timers (guarded — safe if already cleared)
    if (roomIntervals[code]) clearInterval(roomIntervals[code])
    if (roomTimers[code]) clearTimeout(roomTimers[code])
    delete roomIntervals[code]
    delete roomTimers[code]
 

    // 3. Clear all liveVotes for this room — O(1)
    delete liveVotes[code]

    // 4. Remove host mapping
    delete roomHosts[code]

    // 5. Efficient socket cleanup — room-only, not global scan
    const room = io.sockets.adapter.rooms.get(code)
    if (room) {
      room.forEach((socketId) => {
        delete lastAnswerTime[socketId]
      })
    }

    // 6. Delayed delete of roomEnded flag — 5s window covers in-flight async callbacks
    setTimeout(() => delete roomEnded[code], 5000)

  } catch (err) {
    console.error(`cleanupRoom error [room=${code}]:`, err)
  }
}

module.exports = { initQuizSocket }
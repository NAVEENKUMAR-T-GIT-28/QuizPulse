const jwt          = require('jsonwebtoken')
const sanitizeHtml = require('sanitize-html')
const Session      = require('../models/Session')
const Quiz         = require('../models/Quiz')
const { processReveal, buildLeaderboard, getVoteStats } = require('../services/quizService')

/**
 * In-memory stores for the duration of a live session
 * These reset on server restart — that's fine, session data is in MongoDB
 */
const liveVotes  = {}   // { "ROOMCODE": { qIndex: [0, 0, 0, 0] } }
const roomHosts  = {}   // { "ROOMCODE": socketId }
const roomTimers = {}   // { "ROOMCODE": timeoutRef }
const roomIntervals = {} // { "ROOMCODE": intervalRef }
const lastAnswerTime = {} // { socketId: timestamp } — answer throttle
const roomEnded = {}  // { "ROOMCODE": true } — set on quiz:end, checked in interval
const MAX_PLAYERS_PER_ROOM = 100

/**
 * Verify the JWT from socket handshake auth and return the decoded payload,
 * or null if missing/invalid.
 */
function verifySocketToken(socket) {
  try {
    const token = socket.handshake.auth?.token
    if (!token) return null
    return jwt.verify(token, process.env.JWT_SECRET)
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
          return socket.emit('error', { message: 'This session has already ended' })
        }
        
        if (session.players.length >= MAX_PLAYERS_PER_ROOM) {
          return socket.emit('error', { message: `This room is full (max ${MAX_PLAYERS_PER_ROOM} players)` })
        }

        // Prevent duplicate players (reconnect case) atomically
        let updatedSession = await Session.findOneAndUpdate(
          { roomCode: code, 'players.playerId': { $ne: playerId } },
          { $push: { players: { playerId, name: trimmedName, score: 0 } } },
          { new: true }
        )

        // If updatedSession is null, they were already in the array, so just fetch the session again
        if (!updatedSession) {
          updatedSession = await Session.findOne({ roomCode: code })
        }
        
        // We use updatedSession for the rest of the logic
        session = updatedSession

        // Join the socket room
        socket.join(code)
        socket.data.roomCode  = code
        socket.data.playerId  = playerId
        socket.data.isHost    = false

        const quiz = await Quiz.findById(session.quizId)

        // Build the current question payload if the session is mid-game
        // (never include correctIndex — same rule as quiz:question broadcast)
        let currentQuestion = null
        if ((session.status === 'live' || session.status === 'revealing') && quiz) {
          const q = quiz.questions[session.currentIndex]
          if (q) {
            const timeLimit = quiz.timerMode === 'quiz' ? quiz.quizTimeLimit : q.timeLimit
            currentQuestion = {
              index:          session.currentIndex,
              totalQuestions: quiz.questions.length,
              text:           q.text,
              options:        q.options,
              timeLimit,
            }
          }
        }

        // Tell the player they're in
        socket.emit('player:joined', {
          roomCode:        code,
          quizTitle:       quiz?.title || '',
          status:          session.status,
          currentQuestion, // null if waiting/ended, populated if live/revealing
        })

        // Update host with new player list
        const hostSocketId = roomHosts[code]
        if (hostSocketId) {
          io.to(hostSocketId).emit('room:players', {
            count:   session.players.length,
            players: session.players.map((p) => ({ name: p.name, id: p.playerId })),
          })
        }

        console.log(`Player "${trimmedName}" joined room ${code}`)
      } catch (err) {
        console.error('player:join error:', err)
        socket.emit('error', { message: 'Failed to join room' })
      }
    })

    // ─────────────────────────────────────────────
    // PLAYER: Leave a room explicitly
    // ─────────────────────────────────────────────
    socket.on('player:leave', async ({ roomCode, playerId }) => {
      try {
        if (!roomCode || !playerId) return
        const code = roomCode.toUpperCase().trim()
        
        // Remove player from session
        const session = await Session.findOneAndUpdate(
          { roomCode: code },
          { $pull: { players: { playerId } } },
          { new: true }
        )

        if (session) {
          console.log(`Player left room ${code}`)
          // Update host with new player list
          const hostSocketId = roomHosts[code]
          if (hostSocketId) {
            io.to(hostSocketId).emit('room:players', {
              count:   session.players.length,
              players: session.players.map((p) => ({ name: p.name, id: p.playerId })),
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
        socket.data.roomCode  = code
        socket.data.isHost    = true
        socket.data.hostId    = decoded.id
        roomHosts[code]       = socket.id

        socket.emit('host:joined', {
          roomCode: code,
          status:   session.status,
          players:  session.players.map((p) => ({ name: p.name, id: p.playerId })),
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
        const session = await Session.findOne({ roomCode: code })

        if (!session || session.status !== 'waiting') return
        if (roomHosts[code] !== socket.id) return  // only host can start

        const quiz = await Quiz.findById(session.quizId)
        if (!quiz || quiz.questions.length === 0) {
          return socket.emit('error', { message: 'Quiz has no questions' })
        }

        // Update session state
        session.status       = 'live'
        session.currentIndex = 0
        session.startedAt    = new Date()
        session.questionOpenedAt = new Date()
        await session.save()

        // Init vote tracker for question 0
        const q = quiz.questions[0]
        liveVotes[code] = { 0: new Array(q.options.length).fill(0) }

        // Resolve effective time limit — quiz-wide or per-question
        const timeLimit = quiz.timerMode === 'quiz' ? quiz.quizTimeLimit : q.timeLimit

        // Broadcast first question to players (no correctIndex!)
        const questionPayload = {
          index:          0,
          totalQuestions: quiz.questions.length,
          text:           q.text,
          options:        q.options,
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
                isCorrect:     false,  // updated at reveal
                pointsAwarded: 0,      // updated at reveal
                answeredAt:    new Date(),
              }
            }
          },
          { new: true }
        )

        // null means either already answered, or session state changed — either way, bail
        if (!updated) return

        // Update in-memory vote counter
        if (!liveVotes[code])                liveVotes[code] = {}
        if (!liveVotes[code][questionIndex]) liveVotes[code][questionIndex] = new Array(question.options.length).fill(0)
        liveVotes[code][questionIndex][optionIndex]++

        const hostSocketId = roomHosts[code]
        if (hostSocketId) {
          const votes = liveVotes[code][questionIndex]
          io.to(hostSocketId).emit('quiz:stats', {
            votes,
            totalAnswered: votes.reduce((s, v) => s + v, 0),
            totalPlayers:  updated.players.length,
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
        if (roomHosts[code] !== socket.id) return

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
        if (roomHosts[code] !== socket.id) return

        const session = await Session.findOne({ roomCode: code })
        if (!session || session.status !== 'revealing') return

        const quiz = await Quiz.findById(session.quizId)
        const nextIndex = session.currentIndex + 1

        if (nextIndex >= quiz.questions.length) {
          return socket.emit('error', { message: 'No more questions. Use quiz:end to finish.' })
        }

        // Advance to next question
        session.currentIndex     = nextIndex
        session.status           = 'live'
        session.questionOpenedAt = new Date()
        await session.save()

        const q = quiz.questions[nextIndex]
        if (!liveVotes[code]) liveVotes[code] = {}
        liveVotes[code][nextIndex] = new Array(q.options.length).fill(0)

        // Resolve effective time limit — quiz-wide or per-question
        const timeLimit = quiz.timerMode === 'quiz' ? quiz.quizTimeLimit : q.timeLimit

        const questionPayload = {
          index:          nextIndex,
          totalQuestions: quiz.questions.length,
          text:           q.text,
          options:        q.options,
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
        if (roomHosts[code] !== socket.id) return

        roomEnded[code] = true      // set flag immediately
        clearQuestionTimer(code)    // belt-and-suspenders (cleanupRoom will also clear)

        const session = await Session.findOne({ roomCode: code })
        if (!session) return

        session.status  = 'ended'
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
    // ─────────────────────────────────────────────
    socket.on('host:cancel', ({ roomCode }) => {
      try {
        const code = roomCode?.toUpperCase()
        if (roomHosts[code] !== socket.id) return

        io.to(code).emit('session_canceled')
        cleanupRoom(io, code)
        console.log(`Session canceled in room ${code}`)
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
        // Don't delete roomHosts yet — host may reconnect
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
        autoRevealed:  true,
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
    if (roomTimers[code])    clearTimeout(roomTimers[code])
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
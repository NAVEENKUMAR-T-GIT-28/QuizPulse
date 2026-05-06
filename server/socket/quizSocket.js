/**
 * quizSocket.js
 *
 * All session state that was previously stored in process-local Maps
 * is now persisted in Redis via redisStore.js:
 *
 *   liveVotes      → redisStore.initVotes / incrementVote / getVotes
 *   roomHosts      → redisStore.setHost / getHost / deleteHost
 *   roomTimers     → process-local only (timers cannot be serialised);
 *                    timer *metadata* (startedAt, timeLimit) lives in Redis
 *                    so a restarted process can recalculate remaining time.
 *   roomIntervals  → process-local only (same reason)
 *   lastAnswerTime → redisStore.checkAndSetThrottle (atomic SET NX EX 1)
 *   roomEnded      → redisStore.setRoomEnded / isRoomEnded
 *
 * Multi-instance note: the @socket.io/redis-adapter (wired in server.js) fans
 * out io.to(socketId).emit() calls across all instances, so cross-instance
 * host messaging works correctly even though the host socket lives on one node.
 */

'use strict'

const jwt          = require('jsonwebtoken')
const sanitizeHtml = require('sanitize-html')
const Session      = require('../models/Session')
const Quiz         = require('../models/Quiz')
const {
  processReveal,
  buildLeaderboard,
} = require('../services/quizService')
const store = require('../services/redisStore')

// ─── Process-local timer handles ─────────────────────────────────────────────
const roomTimers    = {}
const roomIntervals = {}

const MAX_PLAYERS_PER_ROOM = 100

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function isHost(socket, code) {
  if (!socket.data.isHost) return false
  const storedSocketId = await store.getHost(code)
  return storedSocketId === socket.id
}

function verifySocketToken(socket) {
  try {
    const authToken = socket.handshake.auth?.token
    if (authToken) return jwt.verify(authToken, process.env.JWT_SECRET)
    const raw        = socket.handshake.headers?.cookie || ''
    const tokenMatch = raw.match(/(?:^|;\s*)token=([^;]+)/)
    if (!tokenMatch) return null
    return jwt.verify(decodeURIComponent(tokenMatch[1]), process.env.JWT_SECRET)
  } catch {
    return null
  }
}

function resolveTimeLimit(quiz, questionIndex) {
  if (quiz.timerMode === 'quiz') return quiz.quizTimeLimit
  return quiz.questions[questionIndex].timeLimit
}

// ─── Socket setup ─────────────────────────────────────────────────────────────

function initQuizSocket(io) {
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`)

    // ─── PLAYER: Join ────────────────────────────────────────────────────────
    socket.on('player:join', async ({ roomCode, playerName, playerId }) => {
      try {
        if (!roomCode || !playerName || !playerId) return

        const trimmedName = sanitizeHtml(playerName.trim(), {
          allowedTags: [], allowedAttributes: {},
        })
        if (trimmedName.length < 1)
          return socket.emit('error', { message: 'Player name cannot be empty' })
        if (trimmedName.length > 30)
          return socket.emit('error', { message: 'Player name cannot exceed 30 characters' })

        const code    = roomCode.toUpperCase().trim()
        let   session = await Session.findOne({ roomCode: code })

        if (!session)
          return socket.emit('error', { message: 'Room not found' })
        if (session.status === 'ended') {
          const finalLeaderboard = buildLeaderboard(session.players)
          return socket.emit('quiz:ended', { finalLeaderboard, sessionId: session._id })
        }

        const activePlayers = session.players.filter(p => p.active !== false)
        if (activePlayers.length >= MAX_PLAYERS_PER_ROOM)
          return socket.emit('error', { message: `This room is full (max ${MAX_PLAYERS_PER_ROOM} players)` })

        const existingPlayer = session.players.find(p => p.playerId === playerId)

        if (existingPlayer) {
          await Session.findOneAndUpdate(
            { roomCode: code, 'players.playerId': playerId },
            { $set: { 'players.$.active': true, 'players.$.name': trimmedName, 'players.$.lastJoinedAt': new Date() } }
          )
          session = await Session.findOne({ roomCode: code })
        } else {
          let updated = await Session.findOneAndUpdate(
            { roomCode: code, 'players.playerId': { $ne: playerId } },
            { $push: { players: { playerId, name: trimmedName, score: 0, active: true, lastJoinedAt: new Date() } } },
            { new: true }
          )
          session = updated || await Session.findOne({ roomCode: code })
        }

        socket.join(code)
        socket.data.roomCode = code
        socket.data.playerId = playerId
        socket.data.isHost   = false

        const quiz = await Quiz.findById(session.quizId)

        let currentQuestion = null
        if ((session.status === 'live' || session.status === 'revealing') && quiz) {
          const q         = quiz.questions[session.currentIndex]
          const timeLimit = resolveTimeLimit(quiz, session.currentIndex)
          if (q) {
            currentQuestion = {
              index: session.currentIndex,
              totalQuestions: quiz.questions.length,
              text: q.text,
              options: q.options,
              timeLimit,
            }
          }
        }

        const playerEntry = session.players.find(p => p.playerId === playerId)
        socket.emit('player:joined', {
          roomCode: code,
          quizTitle: quiz?.title || '',
          status: session.status,
          currentQuestion,
          score: playerEntry?.score || 0,
        })

        const hostSocketId = await store.getHost(code)
        if (hostSocketId) {
          io.to(hostSocketId).emit('room:players', {
            count:   session.players.filter(p => p.active !== false).length,
            players: session.players.map(p => ({ name: p.name, id: p.playerId, active: p.active !== false })),
          })
        }

        console.log(`Player "${trimmedName}" ${existingPlayer ? 'reconnected to' : 'joined'} room ${code}`)
      } catch (err) {
        console.error('player:join error:', err)
        socket.emit('error', { message: 'Failed to join room' })
      }
    })

    // ─── PLAYER: Leave ───────────────────────────────────────────────────────
    socket.on('player:leave', async ({ roomCode, playerId }) => {
      try {
        if (!roomCode || !playerId) return
        const code = roomCode.toUpperCase().trim()
        socket.leave(code)
        const session = await Session.findOneAndUpdate(
          { roomCode: code, 'players.playerId': playerId },
          { $set: { 'players.$.active': false } },
          { new: true }
        )
        if (session) {
          console.log(`Player left room ${code} (marked inactive)`)
          const hostSocketId = await store.getHost(code)
          if (hostSocketId) {
            io.to(hostSocketId).emit('room:players', {
              count:   session.players.filter(p => p.active !== false).length,
              players: session.players.map(p => ({ name: p.name, id: p.playerId, active: p.active !== false })),
            })
          }
        }
      } catch (err) {
        console.error('player:leave error:', err)
      }
    })

    // ─── HOST: Join ──────────────────────────────────────────────────────────
    socket.on('host:join', async ({ roomCode }) => {
      try {
        if (!roomCode) return
        const decoded = verifySocketToken(socket)
        if (!decoded)
          return socket.emit('error', { message: 'Authentication required' })

        const code    = roomCode.toUpperCase().trim()
        const session = await Session.findOne({ roomCode: code })
        if (!session)
          return socket.emit('error', { message: 'Session not found' })
        if (session.hostId.toString() !== decoded.id)
          return socket.emit('error', { message: 'Not authorised to host this session' })

        socket.join(code)
        socket.data.roomCode = code
        socket.data.isHost   = true
        socket.data.hostId   = decoded.id

        await store.setHost(code, socket.id)

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
            // Re-arm timer if this process doesn't have one (e.g. after restart)
            if (session.status === 'live' && !roomTimers[code]) {
              const meta = await store.getTimerMeta(code)
              if (meta && meta.remaining > 0) {
                console.log(`[host:join] Re-arming timer for ${code} — ${meta.remaining}s remaining`)
                startQuestionTimer(io, code, session, quiz, timeLimit, meta.remaining)
              }
            }
          }
        }

        socket.emit('host:joined', {
          roomCode: code,
          status: session.status,
          players: session.players.map(p => ({ name: p.name, id: p.playerId, active: p.active !== false })),
          currentQuestion,
        })

        console.log(`Host joined room ${code}`)
      } catch (err) {
        console.error('host:join error:', err)
        socket.emit('error', { message: 'Failed to join as host' })
      }
    })

    // ─── HOST: Start quiz ────────────────────────────────────────────────────
    socket.on('quiz:start', async ({ roomCode }) => {
      try {
        const code    = roomCode?.toUpperCase()
        const session = await Session.findOne({ roomCode: code })
        if (!session || session.status !== 'waiting') return
        if (!(await isHost(socket, code))) return

        const quiz = await Quiz.findById(session.quizId)
        if (!quiz || quiz.questions.length === 0)
          return socket.emit('error', { message: 'Quiz has no questions' })

        session.status           = 'live'
        session.currentIndex     = 0
        session.startedAt        = new Date()
        session.questionOpenedAt = new Date()
        await session.save()

        const q         = quiz.questions[0]
        const timeLimit = resolveTimeLimit(quiz, 0)

        await store.initVotes(code, 0, q.options.length)
        await store.clearRoomEnded(code)

        io.to(code).emit('quiz:question', {
          index: 0,
          totalQuestions: quiz.questions.length,
          text: q.text,
          options: q.options,
          timeLimit,
        })

        startQuestionTimer(io, code, session, quiz, timeLimit)
        console.log(`Quiz started in room ${code}`)
      } catch (err) {
        console.error('quiz:start error:', err)
      }
    })

    // ─── PLAYER: Answer ──────────────────────────────────────────────────────
    socket.on('player:answer', async ({ roomCode, questionIndex, optionIndex, playerId }) => {
      try {
        const throttled = await store.checkAndSetThrottle(socket.id)
        if (throttled) return

        const code    = roomCode?.toUpperCase()
        const session = await Session.findOne({ roomCode: code })
        if (!session || session.status !== 'live') return
        if (session.currentIndex !== questionIndex)  return

        const quiz     = await Quiz.findById(session.quizId)
        const question = quiz?.questions[questionIndex]
        if (!question) return
        if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= question.options.length) return

        const updated = await Session.findOneAndUpdate(
          {
            roomCode: code,
            status: 'live',
            currentIndex: questionIndex,
            'responses': { $not: { $elemMatch: { playerId, questionIndex } } },
          },
          {
            $push: {
              responses: {
                playerId, questionIndex, optionIndex,
                isCorrect: false, pointsAwarded: 0, answeredAt: new Date(),
              },
            },
          },
          { new: true }
        )
        if (!updated) return

        const votes = await store.incrementVote(code, questionIndex, optionIndex, question.options.length)

        const hostSocketId = await store.getHost(code)
        if (hostSocketId) {
          io.to(hostSocketId).emit('quiz:stats', {
            votes,
            totalAnswered: votes.reduce((s, v) => s + v, 0),
            totalPlayers:  updated.players.filter(p => p.active !== false).length,
          })
        }

        socket.emit('answer:received', { questionIndex, optionIndex })
      } catch (err) {
        console.error('player:answer error:', err)
      }
    })

    // ─── HOST: Reveal ────────────────────────────────────────────────────────
    socket.on('quiz:reveal', async ({ roomCode }) => {
      try {
        const code = roomCode?.toUpperCase()
        if (!(await isHost(socket, code))) return

        const session = await Session.findOne({ roomCode: code })
        if (!session || session.status !== 'live') return

        const quiz = await Quiz.findById(session.quizId)
        clearQuestionTimer(code)

        session.status = 'revealing'
        await session.save()

        const timeLimit = resolveTimeLimit(quiz, session.currentIndex)
        const { correctIndex, votes, leaderboard, pointsMap } = await processReveal(session, quiz, timeLimit)

        io.to(code).emit('quiz:result', {
          correctIndex, votes, leaderboard, pointsMap,
          questionIndex: session.currentIndex,
        })

        console.log(`Revealed question ${session.currentIndex} in room ${code}`)
      } catch (err) {
        console.error('quiz:reveal error:', err)
      }
    })

    // ─── HOST: Next question ─────────────────────────────────────────────────
    socket.on('quiz:next', async ({ roomCode }) => {
      try {
        const code = roomCode?.toUpperCase()
        if (!(await isHost(socket, code))) return

        const session = await Session.findOne({ roomCode: code })
        if (!session || session.status !== 'revealing') return

        const quiz      = await Quiz.findById(session.quizId)
        const nextIndex = session.currentIndex + 1

        if (nextIndex >= quiz.questions.length)
          return socket.emit('error', { message: 'No more questions. Use quiz:end to finish.' })

        session.currentIndex     = nextIndex
        session.status           = 'live'
        session.questionOpenedAt = new Date()
        await session.save()

        const q         = quiz.questions[nextIndex]
        const timeLimit = resolveTimeLimit(quiz, nextIndex)

        await store.initVotes(code, nextIndex, q.options.length)
        await store.clearRoomEnded(code)

        io.to(code).emit('quiz:question', {
          index: nextIndex,
          totalQuestions: quiz.questions.length,
          text: q.text,
          options: q.options,
          timeLimit,
        })

        startQuestionTimer(io, code, session, quiz, timeLimit)
        console.log(`Advanced to question ${nextIndex} in room ${code}`)
      } catch (err) {
        console.error('quiz:next error:', err)
      }
    })

    // ─── HOST: End ───────────────────────────────────────────────────────────
    socket.on('quiz:end', async ({ roomCode }) => {
      try {
        const code = roomCode?.toUpperCase()
        if (!(await isHost(socket, code))) return

        await store.setRoomEnded(code)
        clearQuestionTimer(code)

        const session = await Session.findOne({ roomCode: code })
        if (!session) return

        session.status  = 'ended'
        session.endedAt = new Date()
        await session.save()

        const finalLeaderboard = buildLeaderboard(session.players)
        io.to(code).emit('quiz:ended', { finalLeaderboard, sessionId: session._id })

        await cleanupRoom(io, code)
        console.log(`Session ended in room ${code}`)
      } catch (err) {
        console.error('quiz:end error:', err)
      }
    })

    // ─── HOST: Cancel ────────────────────────────────────────────────────────
    socket.on('host:cancel', async ({ roomCode }) => {
      try {
        const code = roomCode?.toUpperCase()
        if (!(await isHost(socket, code))) return

        io.to(code).emit('session_canceled')
        await Session.deleteOne({ roomCode: code })
        await cleanupRoom(io, code)
        console.log(`Session canceled and deleted in room ${code}`)
      } catch (err) {
        console.error('host:cancel error:', err)
      }
    })

    // ─── Disconnect ──────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      const code = socket.data.roomCode

      await store.deleteThrottle(socket.id).catch(() => {})

      if (socket.data.isHost && code) {
        // Don't remove host from Redis — host can reconnect and overwrite socket ID
        socket.to(code).emit('host:disconnected', {
          message: 'Host disconnected. The session may resume shortly.',
        })
      }

      if (!socket.data.isHost && code && socket.data.playerId) {
        const disconnectedAt = new Date()
        Session.findOneAndUpdate(
          {
            roomCode: code,
            'players.playerId': socket.data.playerId,
            'players.lastJoinedAt': { $lt: disconnectedAt },
          },
          { $set: { 'players.$.active': false } },
          { new: true }
        ).then(async (session) => {
          if (session) {
            const hostSocketId = await store.getHost(code)
            if (hostSocketId) {
              io.to(hostSocketId).emit('room:players', {
                count:   session.players.filter(p => p.active !== false).length,
                players: session.players.map(p => ({ name: p.name, id: p.playerId, active: p.active !== false })),
              })
            }
          }
        }).catch(err => console.error('Disconnect cleanup error:', err))
      }

      console.log(`Socket disconnected: ${socket.id}`)
    })
  })
}

// ─── Timer helpers ────────────────────────────────────────────────────────────

/**
 * Start (or re-arm) a countdown timer for the current question.
 *
 * @param {object} io
 * @param {string} code
 * @param {object} session     - Mongoose session document
 * @param {object} quiz        - Mongoose quiz document
 * @param {number} timeLimit   - Full time limit for the question
 * @param {number} [startFrom] - Remaining seconds when re-arming after restart
 */
function startQuestionTimer(io, code, session, quiz, timeLimit, startFrom) {
  clearQuestionTimer(code)

  // Persist metadata in Redis so a recovering process can recalculate remaining time
  store.setTimerMeta(code, { timeLimit, questionIndex: session.currentIndex }).catch(() => {})
  store.clearRoomEnded(code).catch(() => {})

  let remaining = (startFrom !== undefined) ? startFrom : timeLimit

  roomIntervals[code] = setInterval(async () => {
    if (await store.isRoomEnded(code)) {
      clearInterval(roomIntervals[code])
      return
    }
    remaining--
    io.to(code).emit('timer:tick', { remaining })
    if (remaining <= 0) clearInterval(roomIntervals[code])
  }, 1000)

  roomTimers[code] = setTimeout(async () => {
    clearInterval(roomIntervals[code])
    if (await store.isRoomEnded(code)) return

    try {
      const freshSession = await Session.findOne({ roomCode: code })
      if (!freshSession || freshSession.status !== 'live') return

      freshSession.status = 'revealing'
      await freshSession.save()

      const { correctIndex, votes, leaderboard, pointsMap } = await processReveal(freshSession, quiz, timeLimit)

      io.to(code).emit('quiz:result', {
        correctIndex, votes, leaderboard, pointsMap,
        questionIndex: freshSession.currentIndex,
        autoRevealed: true,
      })
    } catch (err) {
      console.error('Auto-reveal error:', err)
    }
  }, remaining * 1000)
}

function clearQuestionTimer(code) {
  if (roomTimers[code])    { clearTimeout(roomTimers[code]);    delete roomTimers[code] }
  if (roomIntervals[code]) { clearInterval(roomIntervals[code]); delete roomIntervals[code] }
}

async function cleanupRoom(io, code) {
  if (!code) return
  try {
    await store.setRoomEnded(code)
    clearQuestionTimer(code)
    await store.cleanupRoomState(code)

    const room = io.sockets.adapter.rooms.get(code)
    if (room) {
      await Promise.allSettled([...room].map(sid => store.deleteThrottle(sid)))
    }

    console.log(`Cleaned up room ${code}`)
  } catch (err) {
    console.error(`cleanupRoom error [room=${code}]:`, err)
  }
}

module.exports = { initQuizSocket }
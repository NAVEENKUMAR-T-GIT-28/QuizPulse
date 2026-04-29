const Session = require('../models/Session')
const Quiz = require('../models/Quiz')
const { processReveal, buildLeaderboard, getVoteStats } = require('../services/quizService')

/**
 * In-memory stores for the duration of a live session
 * These reset on server restart — that's fine, session data is in MongoDB
 */
const liveVotes  = {}   // { "ROOMCODE:qIndex": [0, 0, 0, 0] }
const roomHosts  = {}   // { "ROOMCODE": socketId }
const roomTimers = {}   // { "ROOMCODE": timeoutRef }
const roomIntervals = {} // { "ROOMCODE": intervalRef }

function initQuizSocket(io) {
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`)

    // ─────────────────────────────────────────────
    // PLAYER: Join a room
    // ─────────────────────────────────────────────
    socket.on('player:join', async ({ roomCode, playerName, playerId }) => {
      try {
        if (!roomCode || !playerName || !playerId) return

        const code = roomCode.toUpperCase().trim()
        const session = await Session.findOne({ roomCode: code })

        if (!session) {
          return socket.emit('error', { message: 'Room not found' })
        }
        if (session.status === 'ended') {
          return socket.emit('error', { message: 'This session has already ended' })
        }

        // Prevent duplicate players (reconnect case) atomically
        let updatedSession = await Session.findOneAndUpdate(
          { roomCode: code, 'players.playerId': { $ne: playerId } },
          { $push: { players: { playerId, name: playerName.trim(), score: 0 } } },
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

        // Tell the player they're in
        socket.emit('player:joined', {
          roomCode:  code,
          quizTitle: (await Quiz.findById(session.quizId).select('title')).title,
          status:    session.status,
        })

        // Update host with new player list
        const hostSocketId = roomHosts[code]
        if (hostSocketId) {
          io.to(hostSocketId).emit('room:players', {
            count:   session.players.length,
            players: session.players.map((p) => ({ name: p.name, id: p.playerId })),
          })
        }

        console.log(`Player "${playerName}" joined room ${code}`)
      } catch (err) {
        console.error('player:join error:', err)
        socket.emit('error', { message: 'Failed to join room' })
      }
    })

    // ─────────────────────────────────────────────
    // HOST: Join their own session room
    // ─────────────────────────────────────────────
    socket.on('host:join', async ({ roomCode }) => {
      try {
        if (!roomCode) return

        const code = roomCode.toUpperCase().trim()
        const session = await Session.findOne({ roomCode: code })

        if (!session) {
          return socket.emit('error', { message: 'Session not found' })
        }

        socket.join(code)
        socket.data.roomCode = code
        socket.data.isHost   = true
        roomHosts[code]      = socket.id

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
        liveVotes[`${code}:0`] = new Array(q.options.length).fill(0)

        // Broadcast first question to players (no correctIndex!)
        const questionPayload = {
          index:          0,
          totalQuestions: quiz.questions.length,
          text:           q.text,
          options:        q.options,
          timeLimit:      q.timeLimit,
        }

        io.to(code).emit('quiz:question', questionPayload)

        // Start server-side countdown timer
        startQuestionTimer(io, code, session, quiz, q.timeLimit)

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
        const code = roomCode?.toUpperCase()
        const session = await Session.findOne({ roomCode: code })

        if (!session) return
        if (session.status !== 'live') return
        if (session.currentIndex !== questionIndex) return  // wrong question

        // Prevent double answering
        const alreadyAnswered = session.responses.some(
          (r) => r.playerId === playerId && r.questionIndex === questionIndex
        )
        if (alreadyAnswered) return

        // Validate optionIndex
        const quiz = await Quiz.findById(session.quizId)
        const question = quiz.questions[questionIndex]
        if (!question || optionIndex < 0 || optionIndex >= question.options.length) return

        // Save response (isCorrect and points calculated at reveal)
        session.responses.push({
          playerId,
          questionIndex,
          optionIndex,
          isCorrect:     false,  // updated at reveal
          pointsAwarded: 0,      // updated at reveal
          answeredAt:    new Date(),
        })
        await session.save()

        // Update in-memory vote counter
        const key = `${code}:${questionIndex}`
        if (!liveVotes[key]) liveVotes[key] = new Array(question.options.length).fill(0)
        liveVotes[key][optionIndex]++

        // Send live stats to host only
        const hostSocketId = roomHosts[code]
        if (hostSocketId) {
          io.to(hostSocketId).emit('quiz:stats', {
            votes:         liveVotes[key],
            totalAnswered: liveVotes[key].reduce((s, v) => s + v, 0),
            totalPlayers:  session.players.length,
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
        const { correctIndex, votes, leaderboard } = await processReveal(session, quiz)

        // Broadcast reveal to everyone in the room
        io.to(code).emit('quiz:result', {
          correctIndex,
          votes,
          leaderboard,
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
        liveVotes[`${code}:${nextIndex}`] = new Array(q.options.length).fill(0)

        const questionPayload = {
          index:          nextIndex,
          totalQuestions: quiz.questions.length,
          text:           q.text,
          options:        q.options,
          timeLimit:      q.timeLimit,
        }

        io.to(code).emit('quiz:question', questionPayload)

        // Restart timer for new question
        startQuestionTimer(io, code, session, quiz, q.timeLimit)

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

        clearQuestionTimer(code)

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
        delete roomHosts[code]
        console.log(`Session ended in room ${code}`)
      } catch (err) {
        console.error('quiz:end error:', err)
      }
    })

    // ─────────────────────────────────────────────
    // Disconnect cleanup
    // ─────────────────────────────────────────────
    socket.on('disconnect', () => {
      const code = socket.data.roomCode

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

  let remaining = timeLimit

  // Emit a tick every second
  roomIntervals[code] = setInterval(() => {
    remaining--
    io.to(code).emit('timer:tick', { remaining })

    if (remaining <= 0) {
      clearInterval(roomIntervals[code])
    }
  }, 1000)

  // Auto-reveal when time is up
  roomTimers[code] = setTimeout(async () => {
    clearInterval(roomIntervals[code])

    try {
      // Reload session to get latest state
      const freshSession = await Session.findOne({ roomCode: code })
      if (!freshSession || freshSession.status !== 'live') return

      freshSession.status = 'revealing'
      await freshSession.save()

      const { correctIndex, votes, leaderboard } = await processReveal(freshSession, quiz)

      io.to(code).emit('quiz:result', {
        correctIndex,
        votes,
        leaderboard,
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

module.exports = { initQuizSocket }
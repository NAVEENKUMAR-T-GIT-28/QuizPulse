const express = require('express')
const Session = require('../models/Session')
const Quiz = require('../models/Quiz')
const authMiddleware = require('../middleware/authMiddleware')

const router = express.Router()

// GET /api/session/:roomCode
// Public — used by players to validate a room code before joining
router.get('/:roomCode', async (req, res) => {
  try {
    const session = await Session.findOne({
      roomCode: req.params.roomCode.toUpperCase()
    }).populate('quizId', 'title description questions')

    if (!session) {
      return res.status(404).json({ error: 'Room not found' })
    }

    if (session.status === 'ended') {
      return res.status(410).json({ error: 'This session has already ended' })
    }

    // Return safe info — no correct answers
    res.json({
      sessionId: session._id,
      roomCode: session.roomCode,
      status: session.status,
      quizTitle: session.quizId.title,
      totalQuestions: session.quizId.questions.length,
      playerCount: session.players.length
    })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/session/history — all sessions for this host (protected)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const sessions = await Session.find({ hostId: req.user.id })
      .populate('quizId', 'title')
      .select('roomCode status players startedAt endedAt quizId createdAt')
      .sort({ createdAt: -1 })

    const formatted = sessions.map((s) => ({
      sessionId:    s._id,
      roomCode:     s.roomCode,
      status:       s.status,
      quizTitle:    s.quizId?.title || 'Deleted quiz',
      playerCount:  s.players.length,
      startedAt:    s.startedAt,
      endedAt:      s.endedAt,
      createdAt:    s.createdAt
    }))

    res.json({ sessions: formatted })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/session/:sessionId/results — full results for a session (protected)
router.get('/:sessionId/results', authMiddleware, async (req, res) => {
  try {
    const session = await Session.findOne({
      _id: req.params.sessionId,
      hostId: req.user.id
    }).populate('quizId')

    if (!session) return res.status(404).json({ error: 'Session not found' })

    const leaderboard = [...session.players]
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({ rank: i + 1, name: p.name, score: p.score }))

    const questionStats = session.quizId.questions.map((q, i) => {
      const questionResponses = session.responses.filter((r) => r.questionIndex === i)
      const snapshot = session.voteSnapshots.find((v) => v.questionIndex === i)
      const votes = snapshot ? snapshot.votes : new Array(q.options.length).fill(0)
      const total = votes.reduce((a, b) => a + b, 0)

      return {
        index:        i,
        text:         q.text,
        options:      q.options,
        correctIndex: q.correctIndex,
        votes,
        total,
        percentages:  votes.map((v) => (total > 0 ? Math.round((v / total) * 100) : 0)),
        correctRate:  total > 0
          ? Math.round((votes[q.correctIndex] / total) * 100)
          : 0
      }
    })

    res.json({
      session: {
        roomCode:     session.roomCode,
        status:       session.status,
        quizTitle:    session.quizId.title,
        totalPlayers: session.players.length,
        startedAt:    session.startedAt,
        endedAt:      session.endedAt
      },
      leaderboard,
      questionStats
    })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
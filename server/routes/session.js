const express = require('express')
const Session = require('../models/Session')
const Quiz = require('../models/Quiz')
const authMiddleware = require('../middleware/authMiddleware')
const asyncHandler = require('../utils/asyncHandler')

const router = express.Router()

// ─────────────────────────────────────────────
// 1. Exact paths first — no route params
// ─────────────────────────────────────────────

// GET /api/session/mine — returns the host's current active (non-ended) session, if any (protected)
// Used by useSessionGuard on fresh tab load to redirect host back into their live session.
router.get('/mine', authMiddleware, asyncHandler(async (req, res) => {
  const session = await Session.findOne({
    hostId: req.user.id,
    status: { $in: ['waiting', 'live', 'revealing'] },
  }).select('roomCode status _id').sort({ createdAt: -1 })

  if (!session) return res.json({ session: null })

  res.json({
    session: {
      roomCode:  session.roomCode,
      status:    session.status,
      sessionId: session._id,
    },
  })
}))

// GET /api/session/history — all sessions for this host (protected)
router.get('/history', authMiddleware, asyncHandler(async (req, res) => {
  const sessions = await Session.find({ hostId: req.user.id })
    .populate('quizId', 'title')
    .select('roomCode status players startedAt endedAt quizId createdAt')
    .sort({ createdAt: -1 })

  const formatted = sessions.map((s) => ({
    sessionId:    s._id,
    roomCode:     s.roomCode,
    status:       s.status,
    quizTitle:    s.quizId?.title || 'Deleted quiz',
    playerCount:  s.players.filter(p => p.active !== false).length,
    startedAt:    s.startedAt,
    endedAt:      s.endedAt,
    createdAt:    s.createdAt
  }))

  res.json({ sessions: formatted })
}))

// ─────────────────────────────────────────────
// 2. Sub-resource paths that use :sessionId
// ─────────────────────────────────────────────

// GET /api/session/:sessionId/results — full results for a session (protected)
router.get('/:sessionId/results', authMiddleware, asyncHandler(async (req, res) => {
  const session = await Session.findOne({
    _id: req.params.sessionId,
    hostId: req.user.id
  }).populate('quizId')

  if (!session) return res.status(404).json({ error: 'Session not found' })

  const quiz = session.quizId
  if (!quiz) return res.status(404).json({ error: 'Quiz not found — it may have been deleted.' })

  const leaderboard = [...session.players]
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({ rank: i + 1, name: p.name, score: p.score }))

  const questionStats = quiz.questions.map((q, i) => {
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
      quizTitle:    quiz.title,
      totalPlayers: session.players.length,
      startedAt:    session.startedAt,
      endedAt:      session.endedAt
    },
    leaderboard,
    questionStats
  })
}))

// DELETE /api/session/:sessionId — delete a session (protected, host only)
router.delete('/:sessionId', authMiddleware, asyncHandler(async (req, res) => {
  const session = await Session.findOne({
    _id: req.params.sessionId,
    hostId: req.user.id
  })

  if (!session) {
    return res.status(404).json({ error: 'Session not found or you do not own it' })
  }

  await Session.deleteOne({ _id: session._id })
  res.json({ message: 'Session deleted' })
}))

// ─────────────────────────────────────────────
// 3. Wildcard :roomCode routes LAST
// ─────────────────────────────────────────────

// GET /api/session/:roomCode — public, validate room code before joining
router.get('/:roomCode', asyncHandler(async (req, res) => {
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
    playerCount: session.players.filter(p => p.active !== false).length
  })
}))

// GET /api/session/:roomCode/verify-host — confirm the caller owns this session (protected)
router.get('/:roomCode/verify-host', authMiddleware, asyncHandler(async (req, res) => {
  const session = await Session.findOne({
    roomCode: req.params.roomCode.toUpperCase()
  }).select('hostId status')

  if (!session) {
    return res.status(404).json({ error: 'Session not found' })
  }

  if (session.hostId.toString() !== req.user.id) {
    return res.status(403).json({ error: 'You do not own this session' })
  }

  res.json({ ok: true, status: session.status, sessionId: session._id })
}))

module.exports = router
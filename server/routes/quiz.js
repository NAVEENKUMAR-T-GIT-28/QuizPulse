const express = require('express')
const Quiz = require('../models/Quiz')
const Session = require('../models/Session')
const authMiddleware = require('../middleware/authMiddleware')
const generateRoomCode = require('../utils/roomCode')
const asyncHandler = require('../utils/asyncHandler')

const router = express.Router()

// ─── Validation helper ────────────────────────────────────────
function validateQuizPayload({ title, questions }) {
  const errors = []

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    errors.push('Title is required')
  }
  if (title && title.trim().length > 120) {
    errors.push('Title cannot exceed 120 characters')
  }
  if (!Array.isArray(questions) || questions.length === 0) {
    errors.push('At least one question is required')
  }
  if (Array.isArray(questions) && questions.length > 25) {
    errors.push('Quiz cannot exceed 25 questions')
  }

  questions?.forEach((q, i) => {
    const label = `Question ${i + 1}`
    if (!q.text || typeof q.text !== 'string') errors.push(`${label}: text is required`)
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4) {
      errors.push(`${label}: must have 2–4 options`)
    }
    if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= (q.options?.length ?? 0)) {
      errors.push(`${label}: correctIndex is out of range`)
    }
    if (q.timeLimit !== undefined && (q.timeLimit < 5 || q.timeLimit > 120)) {
      errors.push(`${label}: timeLimit must be between 5 and 120`)
    }
  })

  return errors
}

// All quiz routes require host auth
router.use(authMiddleware)

// GET /api/quiz — all quizzes for logged-in host
router.get('/', asyncHandler(async (req, res) => {
  const quizzes = await Quiz.find({ hostId: req.user.id })
    .select('title description questions createdAt updatedAt')
    .sort({ createdAt: -1 })

  res.json({ quizzes })
}))

// GET /api/quiz/:id — single quiz with all questions
router.get('/:id', asyncHandler(async (req, res) => {
  const quiz = await Quiz.findOne({ _id: req.params.id, hostId: req.user.id })
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' })
  res.json({ quiz })
}))

// POST /api/quiz — create quiz
router.post('/', asyncHandler(async (req, res) => {
  const { title, description, questions, timerMode, quizTimeLimit } = req.body

  const validationErrors = validateQuizPayload(req.body)
  if (validationErrors.length > 0) {
    return res.status(400).json({ error: validationErrors.join('; ') })
  }

  const quiz = await Quiz.create({
    hostId: req.user.id,
    title,
    description: description || '',
    timerMode: timerMode || 'per-question',
    quizTimeLimit: quizTimeLimit || 10,
    questions
  })
  res.status(201).json({ quiz })
}))


// PUT /api/quiz/:id — update quiz
router.put('/:id', asyncHandler(async (req, res) => {
  const { title, description, questions, timerMode, quizTimeLimit } = req.body
  const errors = []

  if (title !== undefined) {
    if (typeof title !== 'string' || title.trim().length === 0)
      errors.push('Title is required')
    if (title.trim().length > 120)
      errors.push('Title cannot exceed 120 characters')
  }

  if (questions !== undefined) {
    if (!Array.isArray(questions) || questions.length === 0) {
      errors.push('At least one question is required')
    } else if (questions.length > 25) {
      errors.push('Quiz cannot exceed 25 questions')
    } else {
      questions.forEach((q, i) => {
        const label = `Question ${i + 1}`
        if (!q.text || typeof q.text !== 'string')
          errors.push(`${label}: text is required`)
        if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4)
          errors.push(`${label}: must have 2–4 options`)
        if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= (q.options?.length ?? 0))
          errors.push(`${label}: correctIndex is out of range`)
        if (q.timeLimit !== undefined && (q.timeLimit < 5 || q.timeLimit > 120))
          errors.push(`${label}: timeLimit must be between 5 and 120`)
      })
    }
  }

  if (errors.length > 0) return res.status(400).json({ error: errors.join('; ') })

  const quiz = await Quiz.findOne({ _id: req.params.id, hostId: req.user.id })
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' })

  if (title !== undefined)           quiz.title = title
  if (description !== undefined)     quiz.description = description
  if (questions !== undefined)       quiz.questions = questions
  if (timerMode !== undefined)       quiz.timerMode = timerMode
  if (quizTimeLimit !== undefined)   quiz.quizTimeLimit = quizTimeLimit

  await quiz.save()
  res.json({ quiz })
}))

// DELETE /api/quiz/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const quiz = await Quiz.findOneAndDelete({ _id: req.params.id, hostId: req.user.id })
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' })
  res.json({ message: 'Quiz deleted' })
}))

// POST /api/quiz/:id/session — create a new live session, get back roomCode
router.post('/:id/session', asyncHandler(async (req, res) => {
  const quiz = await Quiz.findOne({ _id: req.params.id, hostId: req.user.id })
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' })

  // Generate a unique room code
  let roomCode
  for (let attempts = 0; attempts < 10; attempts++) {
    const candidate = generateRoomCode()
    const exists = await Session.findOne({ roomCode: candidate }).lean()
    if (!exists) { roomCode = candidate; break }
  }
  if (!roomCode) {
    return res.status(503).json({ error: 'Could not allocate a room code. Please try again.' })
  }

  const session = await Session.create({
    quizId: quiz._id,
    hostId: req.user.id,
    roomCode,
    status: 'waiting'
  })

  res.status(201).json({
    sessionId: session._id,
    roomCode: session.roomCode
  })
}))

module.exports = router
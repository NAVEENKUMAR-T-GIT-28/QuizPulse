const express = require('express')
const Quiz = require('../models/Quiz')
const Session = require('../models/Session')
const authMiddleware = require('../middleware/authMiddleware')
const generateRoomCode = require('../utils/roomCode')

const router = express.Router()

// All quiz routes require host auth
router.use(authMiddleware)

// GET /api/quiz — all quizzes for logged-in host
router.get('/', async (req, res) => {
  try {
    const quizzes = await Quiz.find({ hostId: req.user.id })
      .select('title description questions createdAt updatedAt')
      .sort({ createdAt: -1 })

    res.json({ quizzes })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/quiz/:id — single quiz with all questions
router.get('/:id', async (req, res) => {
  try {
    const quiz = await Quiz.findOne({ _id: req.params.id, hostId: req.user.id })
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' })
    res.json({ quiz })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/quiz — create quiz
router.post('/', async (req, res) => {
  const { title, description, questions } = req.body

  if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: 'Title and at least one question are required' })
  }

  try {
    const quiz = await Quiz.create({
      hostId: req.user.id,
      title,
      description: description || '',
      questions
    })
    res.status(201).json({ quiz })
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message)
      return res.status(400).json({ error: messages.join(', ') })
    }
    res.status(500).json({ error: 'Server error' })
  }
})

// PUT /api/quiz/:id — update quiz
router.put('/:id', async (req, res) => {
  const { title, description, questions } = req.body

  try {
    const quiz = await Quiz.findOne({ _id: req.params.id, hostId: req.user.id })
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' })

    if (title)       quiz.title = title
    if (description !== undefined) quiz.description = description
    if (questions)   quiz.questions = questions

    await quiz.save()
    res.json({ quiz })
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message)
      return res.status(400).json({ error: messages.join(', ') })
    }
    res.status(500).json({ error: 'Server error' })
  }
})

// DELETE /api/quiz/:id
router.delete('/:id', async (req, res) => {
  try {
    const quiz = await Quiz.findOneAndDelete({ _id: req.params.id, hostId: req.user.id })
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' })
    res.json({ message: 'Quiz deleted' })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/quiz/:id/session — create a new live session, get back roomCode
router.post('/:id/session', async (req, res) => {
  try {
    const quiz = await Quiz.findOne({ _id: req.params.id, hostId: req.user.id })
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' })

    // Generate a unique room code
    let roomCode
    let attempts = 0
    do {
      roomCode = generateRoomCode()
      attempts++
      if (attempts > 10) throw new Error('Could not generate unique room code')
    } while (await Session.findOne({ roomCode }))

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
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' })
  }
})

module.exports = router
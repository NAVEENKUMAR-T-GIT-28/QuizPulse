const express = require('express')
const Session = require('../models/Session')
const Quiz = require('../models/Quiz')
const authMiddleware = require('../middleware/authMiddleware')
const { generateSessionPDF } = require('../services/pdfService')

const router = express.Router()

// GET /api/export/:sessionId
// Protected — only the host who owns the session can export
router.get('/:sessionId', authMiddleware, async (req, res) => {
  try {
    const session = await Session.findOne({
      _id: req.params.sessionId,
      hostId: req.user.id
    })

    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }

    if (session.status !== 'ended') {
      return res.status(400).json({ error: 'Session must be ended before exporting' })
    }

    const quiz = await Quiz.findById(session.quizId)
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' })
    }

    const pdf = await generateSessionPDF(session, quiz)

    const filename = `quizpulse-results-${session.roomCode}-${
      new Date().toISOString().split('T')[0]
    }.pdf`

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': pdf.length
    })

    res.send(pdf)
  } catch (err) {
    console.error('PDF export error:', err)
    res.status(500).json({ error: 'Failed to generate PDF' })
  }
})

module.exports = router
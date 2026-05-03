const express   = require('express')
const rateLimit = require('express-rate-limit')
const Session   = require('../models/Session')
const Quiz      = require('../models/Quiz')
const authMiddleware         = require('../middleware/authMiddleware')
const { generateSessionPDF } = require('../services/pdfService')
const { generateFallbackPDF } = require('../services/pdfKitService')

const router = express.Router()

// ─── Rate limiter ─────────────────────────────────────────────────────────────
// Puppeteer is expensive — cap retries hard.
// Normal export:  5 per 10 minutes per host
// Fallback export: 10 per 10 minutes per host (PDFKit is cheap)

const { ipKeyGenerator } = require('express-rate-limit')

// High-quality (Puppeteer)
const puppeteerLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req),
  standardHeaders: true,
  legacyHeaders: false,
})

// Simple fallback (PDFKit)
const fallbackLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req),
  standardHeaders: true,
  legacyHeaders: false,
})

// ─── Shared session + quiz loader ─────────────────────────────────────────────
async function loadSessionAndQuiz(req, res) {
  const session = await Session.findOne({
    _id:    req.params.sessionId,
    hostId: req.user.id,
  })

  if (!session) {
    res.status(404).json({ error: 'Session not found' })
    return null
  }
  if (session.status !== 'ended') {
    res.status(400).json({ error: 'Session must be ended before exporting' })
    return null
  }

  const quiz = await Quiz.findById(session.quizId)
  if (!quiz) {
    res.status(404).json({ error: 'Quiz not found' })
    return null
  }

  return { session, quiz }
}

function buildFilename(session, suffix = '') {
  const date = new Date().toISOString().split('T')[0]
  return `quizpulse-results-${session.roomCode}${suffix}-${date}.pdf`
}

function sendPDF(res, pdf, filename) {
  res.set({
    'Content-Type':        'application/pdf',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length':      pdf.length,
  })
  res.send(pdf)
}

// ─── Route 1: High-quality export (Puppeteer) ────────────────────────────────
// GET /api/export/:sessionId
router.get('/:sessionId', authMiddleware, puppeteerLimiter, async (req, res) => {
  try {
    const result = await loadSessionAndQuiz(req, res)
    if (!result) return

    const { session, quiz } = result

    try {
      const pdf = await generateSessionPDF(session, quiz)
      return sendPDF(res, pdf, buildFilename(session))
    } catch (puppeteerErr) {
      console.error(`PDF export [Puppeteer] failed [session=${req.params.sessionId}]:`, puppeteerErr)

      // Detect OOM / crash (Puppeteer-specific error messages)
      const isOOM = (
        puppeteerErr.message?.includes('out of memory') ||
        puppeteerErr.message?.includes('ENOMEM') ||
        puppeteerErr.message?.includes('TargetCloseError') ||
        puppeteerErr.message?.includes('Protocol error') ||
        puppeteerErr.message?.includes('crashed') ||
        puppeteerErr.code === 'ERR_OUT_OF_MEMORY'
      )

      if (isOOM) {
        // Tell the client: Puppeteer failed, offer the fallback choice
        return res.status(503).json({
          error:     'pdf_quality_failed',
          message:   'High-quality PDF generation failed due to server memory constraints.',
          fallbackAvailable: true,
        })
      }

      // Unknown error — generic 500
      return res.status(500).json({ error: 'Failed to generate PDF' })
    }
  } catch (err) {
    console.error(`PDF export error [session=${req.params.sessionId}]:`, err)
    res.status(500).json({ error: 'Failed to generate PDF' })
  }
})

// ─── Route 2: Fallback export (PDFKit) ───────────────────────────────────────
// GET /api/export/:sessionId/simple
router.get('/:sessionId/simple', authMiddleware, fallbackLimiter, async (req, res) => {
  try {
    const result = await loadSessionAndQuiz(req, res)
    if (!result) return

    const { session, quiz } = result

    const pdf = await generateFallbackPDF(session, quiz)
    sendPDF(res, pdf, buildFilename(session, '-simple'))
  } catch (err) {
    console.error(`PDF export [PDFKit] error [session=${req.params.sessionId}]:`, err)
    res.status(500).json({ error: 'Failed to generate simple PDF' })
  }
})

module.exports = router
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

    // Gate Puppeteer based on environment variable (resilient parsing)
    const USE_PUPPETEER = String(process.env.ENABLE_PUPPETEER).trim().toLowerCase() === 'true'

    if (USE_PUPPETEER) {
      console.log(`[DEBUG] Attempting Puppeteer export for session ${req.params.sessionId}`)
      try {
        const pdf = await generateSessionPDF(session, quiz)
        console.log(`[DEBUG] Puppeteer export successful`)
        return sendPDF(res, pdf, buildFilename(session))
      } catch (puppeteerErr) {
        console.error(`[DEBUG] PDF export [Puppeteer] failed:`, puppeteerErr)
        
        // Check for common "missing browser" errors
        const isMissingBrowser = (
          puppeteerErr.message?.includes('Could not find Chromium') ||
          puppeteerErr.message?.includes('executable') ||
          puppeteerErr.message?.includes('ENOENT')
        )

        if (isMissingBrowser) {
           console.warn(`[WARNING] Puppeteer is enabled but Chromium binary is missing. Falling back to PDFKit. Run "npm install" in server directory to download Chromium.`)
        }

        const isOOM = (
          puppeteerErr.message?.includes('out of memory') ||
          puppeteerErr.message?.includes('ENOMEM') ||
          puppeteerErr.message?.includes('TargetCloseError') ||
          puppeteerErr.message?.includes('Protocol error') ||
          puppeteerErr.message?.includes('crashed') ||
          puppeteerErr.code === 'ERR_OUT_OF_MEMORY'
        )

        if (isOOM) {
          return res.status(503).json({
            error:     'pdf_quality_failed',
            message:   'High-quality PDF generation failed due to server memory constraints.',
            fallbackAvailable: true,
          })
        }
        console.log(`[DEBUG] Falling back to PDFKit due to Puppeteer error: ${puppeteerErr.message}`)
      }
    } else {
      console.log(`[DEBUG] Puppeteer disabled via ENABLE_PUPPETEER env var. Using PDFKit.`)
    }

    // Fallback path: If Puppeteer is disabled OR failed (and wasn't OOM handled above)
    // We can either return error or automatically trigger fallback. 
    // Instructions say: "If USE_PUPPETEER { ... } else { go straight to pdfKitService }"
    
    const pdf = await generateFallbackPDF(session, quiz)
    return sendPDF(res, pdf, buildFilename(session, '-simple'))

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
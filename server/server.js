require('dotenv').config()

const REQUIRED_ENV = ['JWT_SECRET', 'MONGODB_URI', 'PORT']
const missing = REQUIRED_ENV.filter(key => !process.env[key])
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`)
  process.exit(1)
}

const express      = require('express')
const http         = require('http')
const { Server }   = require('socket.io')
const mongoose     = require('mongoose')
const cors         = require('cors')
const rateLimit    = require('express-rate-limit')
const cookieParser = require('cookie-parser')
const helmet       = require('helmet')
const path         = require('path')

const authRoutes    = require('./routes/auth')
const quizRoutes    = require('./routes/quiz')
const sessionRoutes = require('./routes/session')
const exportRoutes  = require('./routes/export')
const { initQuizSocket } = require('./socket/quizSocket')
const pino = require('pino')
const Sentry = require('@sentry/node')

const logger = pino({ level: process.env.LOG_LEVEL || 'info' })

Sentry.init({ dsn: process.env.SENTRY_DSN })

const app    = express()
const server = http.createServer(app)

// Parse CLIENT_URL to allow multiple domains (comma-separated)
const allowedOrigins = process.env.CLIENT_URL 
  ? process.env.CLIENT_URL.split(',').map(url => url.trim())
  : ['http://localhost:5173']

// ─────────────────────────────────────────────
// Rate limiters
// ─────────────────────────────────────────────
const isTest = process.env.NODE_ENV === 'test'

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: isTest ? 1000 : 10,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 1000 : 200,
  message: { error: 'Too many requests. Slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// ─────────────────────────────────────────────
// Socket.io setup
// ─────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
})

initQuizSocket(io)

// ─────────────────────────────────────────────
// Security headers (helmet)
// Must be first — sets X-Content-Type-Options, X-Frame-Options,
// Strict-Transport-Security, and 10 other protective headers.
// CSP is disabled here because Socket.io and the React SPA
// require a custom policy that varies by deployment host.
// ─────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }))

// ─────────────────────────────────────────────
// Express middleware
// ─────────────────────────────────────────────
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}))
// 1mb is ample for any valid quiz payload (25 questions × 4 options × 500 chars ≈ 50KB).
// The previous 10mb limit was a memory-exhaustion risk.
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true, limit: '100kb' }))
app.use(cookieParser())

// ─────────────────────────────────────────────
// Routes (with rate limiters)
// ─────────────────────────────────────────────
app.use('/api/auth',    authLimiter, authRoutes)
app.use('/api/quiz',    apiLimiter,  quizRoutes)
app.use('/api/session', apiLimiter,  sessionRoutes)
app.use('/api/export',  apiLimiter,  exportRoutes)

// Health check — keeps Render free tier alive
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` })
})

// Global error handler
app.use((err, req, res, next) => {
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error')
  Sentry.captureException(err)
  res.status(500).json({ error: 'Internal server error' })
})

// ─────────────────────────────────────────────
// Database connection + server start
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 5000


// Export `app` so test files can import it without starting a listener.
// The server only listens when this file is the entry point (not required by a test).


module.exports = app

if (require.main === module) {
  mongoose
    .connect(process.env.MONGODB_URI, {
      // Fail fast if Atlas is unreachable — avoids a 30-second hang on startup.
      serverSelectionTimeoutMS: 5000,
      // Drop a stale connection after 45 seconds of inactivity.
      socketTimeoutMS: 45000,
    })
    .then(() => {
      console.log('MongoDB connected')
      server.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`)
        console.log(`URL: http://localhost:${PORT}`)
      })
    })
    .catch((err) => {
      console.error('MongoDB connection error:', err)
      process.exit(1)
    })
}
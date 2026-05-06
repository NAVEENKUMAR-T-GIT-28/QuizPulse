require('dotenv').config()

const REQUIRED_ENV = ['JWT_SECRET', 'MONGODB_URI', 'PORT']
const missing = REQUIRED_ENV.filter(key => !process.env[key])
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`)
  process.exit(1)
}

const express    = require('express')
const http       = require('http')
const { Server } = require('socket.io')
const mongoose   = require('mongoose')
const cors       = require('cors')
const rateLimit  = require('express-rate-limit')
const cookieParser = require('cookie-parser')  

const authRoutes    = require('./routes/auth')
const quizRoutes    = require('./routes/quiz')
const sessionRoutes = require('./routes/session')
const exportRoutes  = require('./routes/export')
const { initQuizSocket } = require('./socket/quizSocket')

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
// Socket.io setup + optional Redis adapter
// ─────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
})

// Wire up the Redis adapter for multi-instance deployments.
// When REDIS_URL is set, socket.io fan-out (io.to(room).emit) works across
// all server instances. When REDIS_URL is absent, the built-in in-process
// adapter is used automatically — no code change needed.
if (process.env.REDIS_URL) {
  try {
    const { createAdapter } = require('@socket.io/redis-adapter')
    const { createClient }  = require('redis')

    const pubClient = createClient({ url: process.env.REDIS_URL })
    const subClient = pubClient.duplicate()

    Promise.all([pubClient.connect(), subClient.connect()])
      .then(() => {
        io.adapter(createAdapter(pubClient, subClient))
        console.log('[Socket.IO] Redis adapter connected')
      })
      .catch(err => {
        console.error('[Socket.IO] Redis adapter failed — using in-process adapter:', err.message)
      })
  } catch (err) {
    console.error('[Socket.IO] @socket.io/redis-adapter not installed — using in-process adapter:', err.message)
  }
}

initQuizSocket(io)

// ─────────────────────────────────────────────
// Express middleware
// ─────────────────────────────────────────────
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
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

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` })
})

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
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
    .connect(process.env.MONGODB_URI)
    .then(() => {
      console.log('MongoDB connected')
      server.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`)
      })
    })
    .catch((err) => {
      console.error('MongoDB connection error:', err)
      process.exit(1)
    })
}
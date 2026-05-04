// server/routes/auth.js

const express        = require('express')
const jwt            = require('jsonwebtoken')
const User           = require('../models/User')
const authMiddleware = require('../middleware/authMiddleware')

const router = express.Router()

// ─── Cookie config ────────────────────────────────────────────
// Shared options for every Set-Cookie call.
// Adjust maxAge to match your JWT expiry (7 days = 604800000 ms).
const COOKIE_OPTIONS = {
  httpOnly:  true,                      // JS cannot read this cookie
  sameSite:  'strict',                  // no cross-site sending
  secure:    process.env.NODE_ENV === 'production',  // HTTPS-only in prod
  maxAge:    7 * 24 * 60 * 60 * 1000,  // 7 days in ms — matches JWT expiry
  path:      '/',
}

// ─── Helper ───────────────────────────────────────────────────
const signToken = (user) =>
  jwt.sign(
    { id: user._id, name: user.name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  )

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' })
  }

  try {
    const existing = await User.findOne({ email: email.toLowerCase() })
    if (existing) {
      return res.status(409).json({ error: 'Email already in use' })
    }

    const user  = await User.create({ name, email, password })
    const token = signToken(user)

    // Set token in httpOnly cookie — never in response body
    res.cookie('token', token, COOKIE_OPTIONS)

    // Return only the safe user object — no token
    res.status(201).json({
      user: { id: user._id, name: user.name, email: user.email }
    })
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message)
      return res.status(400).json({ error: messages.join(', ') })
    }
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase() })
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const isMatch = await user.comparePassword(password)
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const token = signToken(user)

    // Set token in httpOnly cookie — never in response body
    res.cookie('token', token, COOKIE_OPTIONS)

    // Return only the safe user object — no token
    res.json({
      user: { id: user._id, name: user.name, email: user.email }
    })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/auth/logout  ← NEW endpoint
router.post('/logout', (req, res) => {
  // Overwrite the cookie with an expired one — browser deletes it immediately
  res.cookie('token', '', { ...COOKIE_OPTIONS, maxAge: 0 })
  res.json({ message: 'Logged out' })
})

// GET /api/auth/me — verify cookie and return profile
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password')
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json({ user: { id: user._id, name: user.name, email: user.email } })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
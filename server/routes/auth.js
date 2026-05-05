// server/routes/auth.js

const express        = require('express')
const jwt            = require('jsonwebtoken')
const User           = require('../models/User')
const Quiz           = require('../models/Quiz')
const Session        = require('../models/Session')
const authMiddleware = require('../middleware/authMiddleware')
const asyncHandler   = require('../utils/asyncHandler')

const router = express.Router()

// ─── Cookie config ────────────────────────────────────────────
const COOKIE_OPTIONS = {
  httpOnly:  true,
  sameSite:  'strict',
  secure:    process.env.NODE_ENV === 'production',
  maxAge:    7 * 24 * 60 * 60 * 1000,
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
router.post('/register', asyncHandler(async (req, res) => {
  const { name, email, password } = req.body

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' })
  }

  const existing = await User.findOne({ email: email.toLowerCase() })
  if (existing) {
    return res.status(409).json({ error: 'Email already in use' })
  }

  const user  = await User.create({ name, email, password })
  const token = signToken(user)

  res.cookie('token', token, COOKIE_OPTIONS)
  res.status(201).json({
    user: { id: user._id, name: user.name, email: user.email, createdAt: user.createdAt }
  })
}))

// POST /api/auth/login
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }

  const user = await User.findOne({ email: email.toLowerCase() })
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }

  const isMatch = await user.comparePassword(password)
  if (!isMatch) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }

  const token = signToken(user)
  res.cookie('token', token, COOKIE_OPTIONS)
  res.json({
    user: { id: user._id, name: user.name, email: user.email, createdAt: user.createdAt }
  })
}))

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.cookie('token', '', { ...COOKIE_OPTIONS, maxAge: 0 })
  res.json({ message: 'Logged out' })
})

// GET /api/auth/me — verify cookie and return profile
router.get('/me', authMiddleware, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('-password')
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json({ user: { id: user._id, name: user.name, email: user.email, createdAt: user.createdAt } })
}))

// PATCH /api/auth/profile — update name and/or email
router.patch('/profile', authMiddleware, asyncHandler(async (req, res) => {
  const { name, email } = req.body
  if (!name && !email) {
    return res.status(400).json({ error: 'Provide at least name or email to update' })
  }
  const user = await User.findById(req.user.id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  if (name) user.name = name.trim()
  if (email) {
    const existing = await User.findOne({ email: email.toLowerCase(), _id: { $ne: user._id } })
    if (existing) return res.status(409).json({ error: 'Email already in use by another account' })
    user.email = email.toLowerCase().trim()
  }
  await user.save()
  const token = signToken(user)
  res.cookie('token', token, COOKIE_OPTIONS)
  res.json({ user: { id: user._id, name: user.name, email: user.email, createdAt: user.createdAt } })
}))

// POST /api/auth/profile/change-password
router.post('/profile/change-password', authMiddleware, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body
  if (!currentPassword || !newPassword)
    return res.status(400).json({ error: 'Current and new password are required' })
  if (newPassword.length < 6)
    return res.status(400).json({ error: 'New password must be at least 6 characters' })
  const user = await User.findById(req.user.id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  const isMatch = await user.comparePassword(currentPassword)
  if (!isMatch) return res.status(401).json({ error: 'Current password is incorrect' })
  user.password = newPassword
  await user.save()
  res.json({ message: 'Password updated successfully' })
}))

// DELETE /api/auth/account — delete own account (password confirmation required)
router.delete('/account', authMiddleware, asyncHandler(async (req, res) => {
  const { password } = req.body
  if (!password) return res.status(400).json({ error: 'Password required to delete account' })
  const user = await User.findById(req.user.id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  const isMatch = await user.comparePassword(password)
  if (!isMatch) return res.status(401).json({ error: 'Incorrect password' })

  // 1. Delete all Quizzes owned by this user
  // NOTE: Quiz.deleteMany does NOT trigger the post('findOneAndDelete') hook
  // that normally cascades session deletion. The explicit Session.deleteMany
  // below is intentional and MUST NOT be removed — it is the only thing
  // preventing orphaned session documents after account deletion.
  await Quiz.deleteMany({ hostId: user._id })
  await Session.deleteMany({ hostId: user._id })

  // 2. Delete the user
  await User.findByIdAndDelete(req.user.id)

  res.cookie('token', '', { ...COOKIE_OPTIONS, maxAge: 0 })
  res.json({ message: 'Account deleted' })
}))

module.exports = router
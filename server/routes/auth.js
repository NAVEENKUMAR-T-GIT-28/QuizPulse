// server/routes/auth.js

const express        = require('express')
const jwt            = require('jsonwebtoken')
const bcrypt         = require('bcryptjs')
const crypto         = require('crypto')
const User           = require('../models/User')
const Otp            = require('../models/Otp')
const Quiz           = require('../models/Quiz')
const Session        = require('../models/Session')
const authMiddleware = require('../middleware/authMiddleware')
const asyncHandler   = require('../utils/asyncHandler')
const { sendOtpEmail } = require('../services/emailService')
const logger         = require('../utils/logger')

const router = express.Router()

// ─── Cookie config ─────────────────────────────────────────────────────────
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'strict',
  secure:   process.env.NODE_ENV === 'production',
  maxAge:   7 * 24 * 60 * 60 * 1000,
  path:     '/',
}

// ─── Helper ────────────────────────────────────────────────────────────────
const signToken = (user) =>
  jwt.sign(
    { id: user._id, name: user.name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  )

/** Generates a cryptographically random 6-digit numeric OTP string. */
function generateOtp() {
  const n = crypto.randomInt(0, 1_000_000)
  return String(n).padStart(6, '0')
}

// ─── STEP 1: Initiate registration — send OTP ──────────────────────────────
//
// POST /api/auth/register/initiate
// Body: { name, email, password }
//
// Validates input, hashes the password, stores a pending OTP record (TTL 10 min),
// and emails the 6-digit code. Does NOT create a User document yet.
router.post('/register/initiate', asyncHandler(async (req, res) => {
  const { name, email, password } = req.body

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' })
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' })
  }

  const existing = await User.findOne({ email: email.toLowerCase() })
  if (existing) {
    return res.status(409).json({ error: 'Email already in use' })
  }

  const salt         = await bcrypt.genSalt(10)
  const passwordHash = await bcrypt.hash(password, salt)
  const rawOtp       = generateOtp()

  await Otp.createPending({ email, name, rawOtp, passwordHash })

  try {
    await sendOtpEmail(email, name.split(' ')[0], rawOtp)
  } catch (mailErr) {
    logger.error({ err: mailErr }, '[OTP] Failed to send email')
    await Otp.deleteMany({ email: email.toLowerCase() })
    return res.status(502).json({ error: 'Could not send verification email. Please try again.' })
  }

  res.status(202).json({ message: 'OTP sent. Please check your inbox.' })
}))

// ─── STEP 2: Verify OTP and create account ────────────────────────────────
//
// POST /api/auth/register/verify
// Body: { email, otp }
//
// Enforces a 5-attempt brute-force guard. On match: creates the User,
// deletes the Otp record, issues a JWT cookie.
router.post('/register/verify', asyncHandler(async (req, res) => {
  const { email, otp } = req.body

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required' })
  }

  const pending = await Otp.findOne({ email: email.toLowerCase() })
  if (!pending) {
    return res.status(400).json({ error: 'No pending verification found. Please register again.' })
  }

  if (pending.attempts >= 5) {
    await pending.deleteOne()
    return res.status(429).json({ error: 'Too many incorrect attempts. Please register again.' })
  }

  const isMatch = await pending.compareOtp(String(otp).trim())
  if (!isMatch) {
    pending.attempts += 1
    await pending.save()
    const remaining = 5 - pending.attempts
    return res.status(400).json({
      error: remaining > 0
        ? `Incorrect code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`
        : 'Too many incorrect attempts. Please register again.',
    })
  }

  // Guard against race: email registered between initiate and verify
  const alreadyExists = await User.findOne({ email: pending.email })
  if (alreadyExists) {
    await pending.deleteOne()
    return res.status(409).json({ error: 'An account with this email already exists. Please log in.' })
  }

  // Password is already hashed — skip the User pre-save hash hook
  const user = new User({
    name:     pending.name,
    email:    pending.email,
    password: pending.passwordHash,
  })
  user.$locals = { skipPasswordHash: true }
  await user.save()

  await pending.deleteOne()

  const token = signToken(user)
  res.cookie('token', token, COOKIE_OPTIONS)
  res.status(201).json({
    user: { id: user._id, name: user.name, email: user.email, createdAt: user.createdAt },
  })
}))

// ─── Resend OTP ───────────────────────────────────────────────────────────
//
// POST /api/auth/register/resend
// Body: { email }
router.post('/register/resend', asyncHandler(async (req, res) => {
  const { email } = req.body
  if (!email) return res.status(400).json({ error: 'Email is required' })

  const pending = await Otp.findOne({ email: email.toLowerCase() })
  if (!pending) {
    return res.status(400).json({ error: 'No pending verification found. Please register again.' })
  }

  const rawOtp  = generateOtp()
  const salt    = await bcrypt.genSalt(10)
  pending.otpHash   = await bcrypt.hash(String(rawOtp), salt)
  pending.attempts  = 0
  pending.createdAt = new Date()
  await pending.save()

  try {
    await sendOtpEmail(email, pending.name.split(' ')[0], rawOtp)
  } catch (mailErr) {
    logger.error({ err: mailErr }, '[OTP] Resend failed')
    return res.status(502).json({ error: 'Could not resend email. Please try again.' })
  }

  res.json({ message: 'A new OTP has been sent to your inbox.' })
}))

// ─── Login (no OTP — only for verified/existing users) ───────────────────
//
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
    user: { id: user._id, name: user.name, email: user.email, createdAt: user.createdAt },
  })
}))

// ─── Refresh Token ────────────────────────────────────────────────────────
//
// POST /api/auth/refresh
router.post('/refresh', asyncHandler(async (req, res) => {
  const token = req.cookies?.token
  if (!token) return res.status(401).json({ error: 'No token provided' })

  try {
    // Verify token, ignoring expiration so we can refresh an expired token
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true })
    
    const user = await User.findById(decoded.id)
    if (!user) return res.status(404).json({ error: 'User not found' })

    const newToken = signToken(user)
    res.cookie('token', newToken, COOKIE_OPTIONS)
    res.json({ message: 'Token refreshed' })
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' })
  }
}))

// ─── Logout ───────────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.cookie('token', '', { ...COOKIE_OPTIONS, maxAge: 0 })
  res.json({ message: 'Logged out' })
})

// ─── GET /api/auth/me ─────────────────────────────────────────────────────
router.get('/me', authMiddleware, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('-password')
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json({ user: { id: user._id, name: user.name, email: user.email, createdAt: user.createdAt } })
}))

// ─── PATCH /api/auth/profile ──────────────────────────────────────────────
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

// ─── POST /api/auth/profile/change-password ──────────────────────────────
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

// ─── DELETE /api/auth/account ─────────────────────────────────────────────
router.delete('/account', authMiddleware, asyncHandler(async (req, res) => {
  const { password } = req.body
  if (!password) return res.status(400).json({ error: 'Password required to delete account' })
  const user = await User.findById(req.user.id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  const isMatch = await user.comparePassword(password)
  if (!isMatch) return res.status(401).json({ error: 'Incorrect password' })

  await Quiz.deleteMany({ hostId: user._id })
  await Session.deleteMany({ hostId: user._id })
  await User.findByIdAndDelete(req.user.id)

  res.cookie('token', '', { ...COOKIE_OPTIONS, maxAge: 0 })
  res.json({ message: 'Account deleted' })
}))

module.exports = router
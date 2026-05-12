// server/models/PasswordResetOtp.js
// Stores pending password-reset OTPs.
// Separate from the registration Otp model so the two flows never collide.
// Documents auto-expire via MongoDB TTL index after 10 minutes.

const mongoose = require('mongoose')
const bcrypt   = require('bcryptjs')

const PasswordResetOtpSchema = new mongoose.Schema({
  email: {
    type:      String,
    required:  true,
    lowercase: true,
    trim:      true,
    index:     true,
  },
  // bcrypt hash of the OTP — never stored plaintext
  otpHash: {
    type:     String,
    required: true,
  },
  // Tracks brute-force attempts; document is deleted after 5 failures
  attempts: {
    type:    Number,
    default: 0,
  },
  // verified=true means OTP was accepted; the /reset endpoint then allows
  // the password update for up to the remaining TTL window.
  verified: {
    type:    Boolean,
    default: false,
  },
  createdAt: {
    type:    Date,
    default: Date.now,
    // TTL: MongoDB auto-deletes documents 10 min after createdAt
    expires: 600,
  },
})

/** Compare a raw 6-digit OTP against the stored hash */
PasswordResetOtpSchema.methods.compareOtp = async function (rawOtp) {
  return bcrypt.compare(String(rawOtp), this.otpHash)
}

/**
 * Create (or replace) a pending reset record for the given email.
 * Returns the raw OTP so the caller can email it.
 */
PasswordResetOtpSchema.statics.createPending = async function (email) {
  await this.deleteMany({ email: email.toLowerCase() })

  const crypto  = require('crypto')
  const rawOtp  = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  const salt    = await bcrypt.genSalt(10)
  const otpHash = await bcrypt.hash(rawOtp, salt)

  await this.create({ email: email.toLowerCase(), otpHash })
  return rawOtp
}

module.exports = mongoose.model('PasswordResetOtp', PasswordResetOtpSchema)
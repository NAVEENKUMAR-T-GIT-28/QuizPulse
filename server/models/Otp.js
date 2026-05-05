// server/models/Otp.js
// Stores pending email verifications during registration.
// Documents expire automatically via MongoDB TTL index after 10 minutes.

const mongoose = require('mongoose')
const bcrypt   = require('bcryptjs')

const OtpSchema = new mongoose.Schema({
  email: {
    type:      String,
    required:  true,
    lowercase: true,
    trim:      true,
    index:     true,
  },
  // Pending user data — stored here until OTP is confirmed
  name: {
    type:     String,
    required: true,
    trim:     true,
  },
  // bcrypt hash of the OTP so we never store it plaintext
  otpHash: {
    type:     String,
    required: true,
  },
  // bcrypt hash of the password chosen during registration
  passwordHash: {
    type:     String,
    required: true,
  },
  attempts: {
    type:    Number,
    default: 0,
  },
  createdAt: {
    type:    Date,
    default: Date.now,
    // TTL: MongoDB auto-deletes documents 10 min after createdAt
    expires: 600,
  },
})

// Compare a raw 6-digit OTP against the stored hash
OtpSchema.methods.compareOtp = async function (rawOtp) {
  return bcrypt.compare(String(rawOtp), this.otpHash)
}

// Create a new pending record, replacing any existing one for the same email
OtpSchema.statics.createPending = async function ({ email, name, rawOtp, passwordHash }) {
  await this.deleteMany({ email: email.toLowerCase() })

  const salt    = await bcrypt.genSalt(10)
  const otpHash = await bcrypt.hash(String(rawOtp), salt)

  return this.create({ email: email.toLowerCase(), name, otpHash, passwordHash })
}

module.exports = mongoose.model('Otp', OtpSchema)
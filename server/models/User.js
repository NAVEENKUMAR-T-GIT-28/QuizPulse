const mongoose = require('mongoose')
const bcrypt   = require('bcryptjs')

const UserSchema = new mongoose.Schema({
  name: {
    type:      String,
    required:  [true, 'Name is required'],
    trim:      true,
    maxlength: [60, 'Name cannot exceed 60 characters'],
  },
  email: {
    type:     String,
    required: [true, 'Email is required'],
    unique:   true,
    lowercase: true,
    trim:     true,
    match:    [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
  },
  password: {
    type:      String,
    required:  [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
  },
  createdAt: {
    type:    Date,
    default: Date.now,
  },
})

// Hash password before saving.
// Skipped when $locals.skipPasswordHash is true — used by the OTP verify
// route which stores an already-hashed password to avoid double-hashing.
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next()
  if (this.$locals && this.$locals.skipPasswordHash) return next()
  const salt = await bcrypt.genSalt(10)
  this.password = await bcrypt.hash(this.password, salt)
  next()
})

// Compare a plain password with the stored hash
UserSchema.methods.comparePassword = async function (plainPassword) {
  return bcrypt.compare(plainPassword, this.password)
}

module.exports = mongoose.model('User', UserSchema)
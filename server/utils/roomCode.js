// Generates a random 6-char uppercase room code using crypto-safe randomness
const { randomBytes } = require('crypto')

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // Removed easily confused chars like I, 1, O, 0

const generateRoomCode = () => {
  const bytes = randomBytes(6)
  return Array.from(bytes)
    .map(b => CHARS[b % CHARS.length])
    .join('')
}

module.exports = generateRoomCode
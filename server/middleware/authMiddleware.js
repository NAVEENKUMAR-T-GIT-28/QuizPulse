// server/middleware/authMiddleware.js

const jwt = require('jsonwebtoken')

const authMiddleware = (req, res, next) => {
  // Read JWT exclusively from the httpOnly cookie set at login/register.
  // The Bearer token / Authorization header fallback has been removed —
  // the cookie-only migration is complete.
  const token = req.cookies?.token

  if (!token) {
    return res.status(401).json({ error: 'No token provided' })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.user = decoded   // { id, name, email }
    next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' })
    }
    return res.status(401).json({ error: 'Invalid token' })
  }
}

module.exports = authMiddleware
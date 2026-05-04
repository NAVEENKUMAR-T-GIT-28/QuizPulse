// server/middleware/authMiddleware.js

const jwt = require('jsonwebtoken')

const authMiddleware = (req, res, next) => {
  // 1. Prefer the httpOnly cookie (post-migration)
  // 2. Fall back to Authorization header so existing API clients keep working
  //    during the transition period. Remove the header fallback once all
  //    clients have migrated.
  const token =
    req.cookies?.token ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.split(' ')[1]
      : null)

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
// server/utils/asyncHandler.js
//
// Wraps async Express route handlers so that rejected promises
// are forwarded to Express's global error middleware via next().
// Without this, an unhandled rejection in a route will cause Express
// to hang (older Node) or crash (newer Node).

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next)

module.exports = asyncHandler

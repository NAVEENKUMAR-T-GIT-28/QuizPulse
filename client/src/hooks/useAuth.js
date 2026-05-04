// client/src/hooks/useAuth.js  (full replacement)

const USER_KEY = 'user'

// ── Read the stored user (for UI display only — no token) ────────
export function getUser() {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

// ── Called after a successful login/register response ────────────
// The server sets the httpOnly cookie; we only store the user object.
export function saveAuth(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

// ── Called on logout ─────────────────────────────────────────────
export function clearAuth() {
  localStorage.removeItem(USER_KEY)
  // The actual cookie is cleared by calling POST /api/auth/logout
  // (see handleLogout in HostDashboard.jsx)
}

// ── Still useful for quick UI checks ─────────────────────────────
export function isLoggedIn() {
  return !!getUser()
}

// ── REMOVED: getToken() — no token in JS-land anymore ────────────
// If you see getToken() still used anywhere, replace it with nothing
// — axios with withCredentials sends the cookie automatically.
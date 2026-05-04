/**
 * ActiveSessionContext
 *
 * Tracks whether there is a live quiz session in progress.
 * Persisted to localStorage so it survives tab close + new tab.
 *
 * Shape: { role: 'host' | 'player', roomCode, sessionId?, playerId?, playerName? } | null
 */

const KEY = 'qp_active_session'

export function setActiveSession(data) {
  localStorage.setItem(KEY, JSON.stringify(data))
}

export function clearActiveSession() {
  localStorage.removeItem(KEY)
}

export function getActiveSession() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

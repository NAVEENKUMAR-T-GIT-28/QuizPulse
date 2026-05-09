/**
 * useSessionGuard
 *
 * Runs once on app start (inside BrowserRouter) before any route renders.
 * Returns `true` when the check is complete (routes may render).
 * Returns `false` while checking (shows a loading spinner).
 *
 * Two-path recovery:
 *
 *  A) localStorage has qp_active_session
 *     → Validate the room with the server.
 *     → If still live: redirect to the correct live page.
 *     → If ended / not found: clear stale entry and let routing proceed.
 *
 *  B) localStorage is empty but user has a valid JWT (host)
 *     → Call GET /api/session/mine to find any active session owned by them.
 *     → If found: write it to localStorage and redirect.
 *     → If not found: let routing proceed normally.
 *
 * This means:
 *  - Host closes tab mid-quiz → opens new tab → lands on dashboard → immediately
 *    redirected back to /host/:roomCode (or /lobby/:roomCode if still waiting).
 *  - Player closes tab → opens new tab → types the URL → localStorage has their
 *    identity → redirected to /play/:roomCode.
 *  - Session has already ended → stale localStorage cleared → no redirect.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/quizApi'
import { getActiveSession, setActiveSession, clearActiveSession } from '../context/ActiveSessionContext'

export default function useSessionGuard() {
  const navigate   = useNavigate()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function check() {
      // ── Path A: we have a locally-stored session ─────────────────
      const local = getActiveSession()
      if (local) {
        try {
          const { data } = await api.get(`/api/session/${local.roomCode}`)

          if (cancelled) return

          if (data.status === 'ended') {
            clearActiveSession()
            setChecked(true)
            return
          }

          // Redirect to the correct live page
          if (local.role === 'host') {
            const target = data.status === 'waiting'
              ? `/lobby/${local.roomCode}`
              : `/host/${local.roomCode}`
            navigate(target, { replace: true })
          } else {
            // Restore player identity into the keys PlayerGame / PlayerLobby read
            if (local.playerId)   localStorage.setItem('qp_playerId',   local.playerId)
            if (local.playerName) localStorage.setItem('qp_playerName', local.playerName)
            if (local.roomCode)   localStorage.setItem('qp_roomCode',   local.roomCode)

            const target = data.status === 'waiting'
              ? `/lobby/${local.roomCode}/wait`
              : `/play/${local.roomCode}`
            navigate(target, { replace: true })
          }
        } catch {
          // 404 / network error — stale entry, clear it
          clearActiveSession()
        }

        setChecked(true)
        return
      }

      // ── Path B: no local session — check if host has a live session ─
      // Only attempt this when the user is authenticated (has a JWT cookie).
      // The request will 401 silently if they're not logged in.
      try {
        const { data } = await api.get('/api/session/mine')

        if (cancelled) return

        if (data.session) {
          const { roomCode, status, sessionId } = data.session
          setActiveSession({ role: 'host', roomCode, sessionId })

          const target = status === 'waiting'
            ? `/lobby/${roomCode}`
            : `/host/${roomCode}`
          navigate(target, { replace: true })
        }
      } catch {
        // 401 (not logged in) or network error — just proceed normally
      }

      setChecked(true)
    }

    check()
    return () => { cancelled = true }
  }, [navigate])

  return checked
}

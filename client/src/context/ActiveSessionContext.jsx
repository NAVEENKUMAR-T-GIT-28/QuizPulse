/**
 * ActiveSessionContext
 *
 * Tracks whether there is a live quiz session in progress.
 * Persisted to sessionStorage so it survives hard refreshes.
 *
 * Shape: { role: 'host' | 'player', roomCode: string } | null
 */
import { createContext, useContext, useState, useCallback } from 'react'

const KEY = 'qp_active_session'

function read() {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function write(val) {
  if (val) {
    sessionStorage.setItem(KEY, JSON.stringify(val))
  } else {
    sessionStorage.removeItem(KEY)
  }
}

const ActiveSessionContext = createContext(null)

export function ActiveSessionProvider({ children }) {
  const [session, setSessionState] = useState(() => read())

  const setSession = useCallback((val) => {
    write(val)
    setSessionState(val)
  }, [])

  const clearSession = useCallback(() => {
    write(null)
    setSessionState(null)
  }, [])

  return (
    <ActiveSessionContext.Provider value={{ session, setSession, clearSession }}>
      {children}
    </ActiveSessionContext.Provider>
  )
}

export function useActiveSession() {
  return useContext(ActiveSessionContext)
}
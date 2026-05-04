/**
 * useSessionGuard
 *
 * Pushes a dummy history entry on mount so the browser back button
 * stays on the current page instead of navigating away.
 * If the user presses back anyway, we intercept popstate and push forward again.
 *
 * Usage: call this at the top of HostLive and PlayerGame.
 * Pass `active = false` to disable (e.g. after session ends).
 */
import { useEffect } from 'react'

export function useSessionGuard(active = true) {
  useEffect(() => {
    if (!active) return

    // Push a duplicate entry so there is something to intercept
    window.history.pushState(null, '', window.location.href)

    function handlePopState() {
      // Push forward again — user stays on this page
      window.history.pushState(null, '', window.location.href)
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [active])
}
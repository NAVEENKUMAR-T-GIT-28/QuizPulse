import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import ProtectedRoute   from './components/ProtectedRoute'
import LandingPage      from './pages/LandingPage'
import AuthPage         from './pages/AuthPage'
import HostDashboard    from './pages/HostDashboard'
import QuizBuilder      from './pages/QuizBuilder'
import HostLobby        from './pages/HostLobby'
import HostLive         from './pages/HostLive'
import JoinPage         from './pages/JoinPage'
import PlayerLobby      from './pages/PlayerLobby'
import PlayerGame       from './pages/PlayerGame'
import ResultsPage      from './pages/ResultsPage'
import HistoryPage      from './pages/HistoryPage'
import { useActiveSession } from './context/ActiveSessionContext'

/**
 * GlobalSessionRedirect
 *
 * Runs on every route change. If there is a live session registered in
 * ActiveSessionContext but the user is NOT on the correct live route,
 * immediately redirect them back.
 *
 * This handles:
 *  - Host pressing browser back from /host/:code → dashboard
 *  - Player pressing browser back from /play/:code → lobby
 *  - Any external link click while session is active
 */
function GlobalSessionRedirect() {
  const { session } = useActiveSession()
  const navigate    = useNavigate()
  const location    = useLocation()

  useEffect(() => {
    if (!session) return

    const { role, roomCode } = session
    const liveRoute = role === 'host'
      ? `/host/${roomCode}`
      : `/play/${roomCode}`

    // Allow staying on the correct live page; also allow results page after quiz ends
    const onLivePage    = location.pathname === liveRoute
    const onResultsPage = location.pathname.startsWith('/results/')

    if (!onLivePage && !onResultsPage) {
      navigate(liveRoute, { replace: true })
    }
  }, [location.pathname, session, navigate])

  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <GlobalSessionRedirect />
      <Routes>
        <Route path="/"                    element={<LandingPage />} />
        <Route path="/auth"                element={<AuthPage />} />

        {/* Host routes — require JWT */}
        <Route path="/dashboard"           element={<ProtectedRoute><HostDashboard /></ProtectedRoute>} />
        <Route path="/quiz/new"            element={<ProtectedRoute><QuizBuilder /></ProtectedRoute>} />
        <Route path="/quiz/:id/edit"       element={<ProtectedRoute><QuizBuilder /></ProtectedRoute>} />
        <Route path="/lobby/:roomCode"     element={<ProtectedRoute><HostLobby /></ProtectedRoute>} />
        <Route path="/host/:roomCode"      element={<ProtectedRoute><HostLive /></ProtectedRoute>} />
        <Route path="/results/:sessionId"  element={<ProtectedRoute><ResultsPage /></ProtectedRoute>} />
        <Route path="/history"             element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />

        {/* Player routes — no auth */}
        <Route path="/join"                element={<JoinPage />} />
        <Route path="/join/:code"          element={<JoinPage />} />
        <Route path="/lobby/:roomCode/wait" element={<PlayerLobby />} />
        <Route path="/play/:roomCode"      element={<PlayerGame />} />
      </Routes>
    </BrowserRouter>
  )
}
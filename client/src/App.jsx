import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Component } from 'react'
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
import ProfilePage      from './pages/ProfilePage'
import useSessionGuard  from './hooks/useSessionGuard'
import Background       from './components/backgroud/backgroud'

/**
 * ErrorBoundary
 *
 * Catches any render error in the component tree and shows a plain
 * recovery screen instead of a blank white page.
 * Must be a class component — React has no hook equivalent for
 * componentDidCatch / getDerivedStateFromError.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Unknown error' }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Caught render error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 16, padding: 24, textAlign: 'center',
        }}>
          <div style={{ fontSize: 48 }}>⚠️</div>
          <h2 style={{ margin: 0, fontSize: 20 }}>Something went wrong</h2>
          <p style={{ color: 'var(--text2)', maxWidth: 340, margin: 0, fontSize: 14 }}>
            {this.state.message}
          </p>
          <button
            className="btn btn-primary"
            onClick={() => {
              this.setState({ hasError: false, message: '' })
              window.location.href = '/'
            }}
          >
            Go to home screen
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

/**
 * AppRoutes
 *
 * Runs useSessionGuard before rendering any route.
 * This blocks the UI with a spinner while we check if the user has an
 * active session (even after closing and reopening the tab), then
 * redirects them to the correct live page automatically.
 */
function AppRoutes() {
  const ready = useSessionGuard()

  if (!ready) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 20 }}>
        <div className="spinner"></div>
        <div style={{ color: 'var(--text2)', fontSize: 14 }}>Resuming session...</div>
      </div>
    )
  }

  return (
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
      <Route path="/profile"             element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />

      {/* Player routes — no auth */}
      <Route path="/join"                 element={<JoinPage />} />
      <Route path="/join/:code"           element={<JoinPage />} />
      <Route path="/lobby/:roomCode/wait" element={<PlayerLobby />} />
      <Route path="/play"                 element={<Navigate to="/join" replace />} />
      <Route path="/play/:roomCode"       element={<PlayerGame />} />
      <Route path="*"                     element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Background />
        <AppRoutes />
      </BrowserRouter>
    </ErrorBoundary>
  )
}
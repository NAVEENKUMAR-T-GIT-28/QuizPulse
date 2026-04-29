import { BrowserRouter, Routes, Route } from 'react-router-dom'
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

export default function App() {
  return (
    <BrowserRouter>
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

        {/* Player routes — no auth */}
        <Route path="/join"                element={<JoinPage />} />
        <Route path="/join/:code"          element={<JoinPage />} />
        <Route path="/lobby/:roomCode/wait" element={<PlayerLobby />} />
        <Route path="/play/:roomCode"      element={<PlayerGame />} />
      </Routes>
    </BrowserRouter>
  )
}

import ThemeToggle from '../components/ThemeToggle'
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { validateRoom } from '../api/quizApi'
import useQuizStore from '../store/useQuizStore'

export default function JoinPage() {
  const { code } = useParams()
  const navigate = useNavigate()

  const [roomCode, setRoomCode]     = useState(code?.toUpperCase() || '')
  const [playerName, setPlayerName] = useState('')
  const [error, setError]           = useState(null)
  const [loading, setLoading]       = useState(false)
  const [roomInfo, setRoomInfo]     = useState(null)

  async function handleJoin(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      // 1. Validate the room code via REST
      const data = await validateRoom(roomCode.toUpperCase())

      // 2. Generate or retrieve a persistent playerId
      let playerId = localStorage.getItem('qp_playerId')
      if (!playerId) {
        playerId = crypto.randomUUID()
        localStorage.setItem('qp_playerId', playerId)
      }

      // 3. Save player info to store
      useQuizStore.getState().setPlayerId(playerId)
      useQuizStore.getState().setPlayerName(playerName.trim())
      useQuizStore.getState().setRoom(data.roomCode, data.sessionId)

      // 4. Persist to sessionStorage so lobby/game pages survive a browser refresh
      localStorage.setItem('qp_playerName', playerName.trim())
      localStorage.setItem('qp_playerId', playerId)
      localStorage.setItem('qp_roomCode', data.roomCode)

      // 5. Navigate to player lobby
      navigate(`/lobby/${data.roomCode}/wait`)
    } catch (err) {
      setError(err.response?.data?.error || 'Room not found')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 20, right: 24, zIndex: 10 }}><ThemeToggle /></div>
      {/* Background */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(99,102,241,.12) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div className="fade-up" style={{ width: '100%', maxWidth: 460, padding: 24, position: 'relative', zIndex: 1 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div
            style={{ fontSize: 24, fontWeight: 900, color: 'var(--indigo-l)', letterSpacing: '-.3px', marginBottom: 6, cursor: 'pointer' }}
            onClick={() => navigate('/')}
          >
            QuizPulse
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.4px', marginBottom: 4 }}>
            Join a Quiz
          </div>
          <div style={{ fontSize: 14, color: 'var(--text2)' }}>
            Enter the room code shown on the host's screen
          </div>
        </div>

        {/* Card */}
        <div className="glass" style={{ borderRadius: 'var(--r3)', padding: 32 }}>
          {error && <div className="error-msg">{error}</div>}

          <form onSubmit={handleJoin}>
            {/* Room code */}
            <div style={{ marginBottom: 20 }}>
              <div className="section-label">Room Code</div>
              <input
                id="input-room-code"
                className="code-big"
                placeholder="ENTER CODE"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                maxLength={10}
                required
              />
            </div>

            {/* Name */}
            <div style={{ marginBottom: 24 }}>
              <div className="section-label">Your Name</div>
              <input
                id="input-player-name"
                className="name-big"
                placeholder="Enter your display name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                maxLength={30}
                required
              />
            </div>

            {/* Submit */}
            <button
              id="btn-join-submit"
              className="btn btn-primary btn-lg"
              style={{ width: '100%' }}
              type="submit"
              disabled={loading || !roomCode.trim() || !playerName.trim()}
            >
              {loading ? (
                <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
              ) : (
                <>
                  <span className="mat">login</span>
                  Join Quiz
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'var(--text3)' }}>
            Want to host? <span style={{ color: 'var(--indigo-l)', cursor: 'pointer', fontWeight: 700 }} onClick={() => navigate('/auth')}>Sign in →</span>
          </div>
        </div>
      </div>
    </div>
  )
}
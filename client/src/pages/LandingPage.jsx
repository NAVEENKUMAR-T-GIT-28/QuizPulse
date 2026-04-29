import { useNavigate } from 'react-router-dom'
import { isLoggedIn } from '../hooks/useAuth'

export default function LandingPage() {
  const navigate = useNavigate()

  function handleHost() {
    navigate(isLoggedIn() ? '/dashboard' : '/auth')
  }

  function handleJoin() {
    navigate('/join')
  }

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
      {/* Background glow */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(99,102,241,.15) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 40% 40% at 80% 80%, rgba(34,197,94,.06) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div className="fade-up" style={{ textAlign: 'center', maxWidth: 600, padding: 24, position: 'relative', zIndex: 1 }}>
        {/* Logo */}
        <div style={{ marginBottom: 16 }}>
          <span className="mat xl" style={{ color: 'var(--indigo-l)', fontSize: 48 }}>bolt</span>
        </div>
        <h1 style={{ fontSize: 48, fontWeight: 900, letterSpacing: '-.5px', marginBottom: 8, lineHeight: 1.1 }}>
          Quiz<span style={{ color: 'var(--indigo-l)' }}>Pulse</span>
        </h1>
        <p style={{ fontSize: 18, color: 'var(--text2)', marginBottom: 8, lineHeight: 1.5 }}>
          Real-time interactive quizzes that engage your audience
        </p>
        <p style={{ fontSize: 14, color: 'var(--text3)', marginBottom: 40 }}>
          Create, host, and play live quizzes with instant results and leaderboards
        </p>

        {/* CTA Buttons */}
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            id="btn-host"
            className="btn btn-primary btn-lg"
            onClick={handleHost}
            style={{ minWidth: 200, fontSize: 16, padding: '16px 32px' }}
          >
            <span className="mat">person</span>
            Host a Quiz
          </button>
          <button
            id="btn-join"
            className="btn btn-ghost btn-lg"
            onClick={handleJoin}
            style={{ minWidth: 200, fontSize: 16, padding: '16px 32px' }}
          >
            <span className="mat">group_add</span>
            Join a Quiz
          </button>
        </div>

        {/* Feature pills */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 48, flexWrap: 'wrap' }}>
          <div className="badge badge-indigo" style={{ padding: '6px 14px', fontSize: 12 }}>
            <span className="mat sm">speed</span> Real-time
          </div>
          <div className="badge badge-green" style={{ padding: '6px 14px', fontSize: 12 }}>
            <span className="mat sm">leaderboard</span> Leaderboards
          </div>
          <div className="badge" style={{ padding: '6px 14px', fontSize: 12, background: 'rgba(245,158,11,.1)', color: '#fbbf24', border: '1px solid rgba(245,158,11,.2)' }}>
            <span className="mat sm">qr_code</span> QR Join
          </div>
          <div className="badge" style={{ padding: '6px 14px', fontSize: 12, background: 'rgba(239,68,68,.1)', color: '#f87171', border: '1px solid rgba(239,68,68,.2)' }}>
            <span className="mat sm">picture_as_pdf</span> PDF Export
          </div>
        </div>
      </div>
    </div>
  )
}

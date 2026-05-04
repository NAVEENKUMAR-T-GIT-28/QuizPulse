import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, register } from '../api/quizApi'
import { saveAuth } from '../hooks/useAuth'

export default function AuthPage() {
  const navigate = useNavigate()
  const [mode, setMode]         = useState('login')   // 'login' | 'register'
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState(null)
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      let data
      if (mode === 'login') {
        data = await login(email, password)
      } else {
        data = await register(name, email, password)
      }
      saveAuth(data.user)
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      {/* Background glow */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(99,102,241,.12) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div className="fade-up" style={{ width: '100%', maxWidth: 420, padding: 24, position: 'relative', zIndex: 1 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--indigo-l)', letterSpacing: '-.3px', marginBottom: 6, cursor: 'pointer' }} onClick={() => navigate('/')}>
            QuizPulse
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.4px', marginBottom: 4 }}>
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </div>
          <div style={{ fontSize: 14, color: 'var(--text2)' }}>
            {mode === 'login' ? 'Sign in to your host console' : 'Get started hosting quizzes'}
          </div>
        </div>

        {/* Card */}
        <div className="glass" style={{ borderRadius: 'var(--r3)', padding: 32 }}>
          {/* Tabs */}
          <div className="auth-seg">
            <button
              id="seg-login"
              className={`auth-seg-btn ${mode === 'login' ? 'on' : ''}`}
              onClick={() => { setMode('login'); setError(null) }}
            >
              Sign in
            </button>
            <button
              id="seg-register"
              className={`auth-seg-btn ${mode === 'register' ? 'on' : ''}`}
              onClick={() => { setMode('register'); setError(null) }}
            >
              Create account
            </button>
          </div>

          {/* Error */}
          {error && <div className="error-msg">{error}</div>}

          {/* Form */}
          <form onSubmit={handleSubmit}>
            {mode === 'register' && (
              <div style={{ marginBottom: 14 }}>
                <label className="section-label">Name</label>
                <input
                  id="input-name"
                  className="input"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            )}
            <div style={{ marginBottom: 14 }}>
              <label className="section-label">Email</label>
              <input
                id="input-email"
                className="input"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label className="section-label">Password</label>
              <input
                id="input-password"
                className="input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button
              id="btn-auth-submit"
              className="btn btn-primary btn-lg"
              style={{ width: '100%' }}
              type="submit"
              disabled={loading}
            >
              {loading ? (
                <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
              ) : (
                <>
                  {mode === 'login' ? 'Sign in' : 'Create account'}
                  <span className="mat">arrow_forward</span>
                </>
              )}
            </button>
          </form>

          {/* Footer link */}
          <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'var(--text3)' }}>
            Player? <span style={{ color: 'var(--indigo-l)', cursor: 'pointer', fontWeight: 700 }} onClick={() => navigate('/join')}>Join a quiz →</span>
          </div>
        </div>
      </div>
    </div>
  )
}

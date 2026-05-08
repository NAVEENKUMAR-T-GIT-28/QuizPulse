// client/src/pages/AuthPage.jsx
// Login is unchanged — no OTP needed for existing users.
// Registration is a two-step flow: fill in details → verify email with OTP.

import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, registerInitiate, registerVerify, registerResend } from '../api/quizApi'
import ThemeToggle from '../components/ThemeToggle'
import { saveAuth } from '../hooks/useAuth'

// ─── OTP digit input component ────────────────────────────────────────────
function OtpInput({ value, onChange, disabled }) {
  const inputs = useRef([])
  const digits  = (value + '      ').slice(0, 6).split('')

  function handleKey(i, e) {
    if (e.key === 'Backspace') {
      e.preventDefault()
      const next = value.slice(0, i) + value.slice(i + 1)
      onChange(next)
      if (i > 0) inputs.current[i - 1]?.focus()
      return
    }
    if (e.key === 'ArrowLeft' && i > 0) { inputs.current[i - 1]?.focus(); return }
    if (e.key === 'ArrowRight' && i < 5) { inputs.current[i + 1]?.focus(); return }
  }

  function handleChange(i, e) {
    const raw = e.target.value.replace(/\D/g, '')
    if (!raw) return

    // Handle paste of all 6 digits at once
    if (raw.length >= 6) {
      onChange(raw.slice(0, 6))
      inputs.current[5]?.focus()
      return
    }

    const next = value.slice(0, i) + raw[0] + value.slice(i + 1)
    onChange(next.slice(0, 6))
    if (i < 5) inputs.current[i + 1]?.focus()
  }

  function handlePaste(e) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted) {
      e.preventDefault()
      onChange(pasted.padEnd(6, ' ').slice(0, 6).trimEnd())
      inputs.current[Math.min(pasted.length, 5)]?.focus()
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '8px 0 20px' }}>
      {[0, 1, 2, 3, 4, 5].map(i => (
        <input
          key={i}
          ref={el => inputs.current[i] = el}
          type="text"
          inputMode="numeric"
          maxLength={1}
          disabled={disabled}
          value={digits[i].trim()}
          onChange={e => handleChange(i, e)}
          onKeyDown={e => handleKey(i, e)}
          onPaste={handlePaste}
          onFocus={e => e.target.select()}
          style={{
            width: 44, height: 52,
            textAlign: 'center',
            fontSize: 22, fontWeight: 700,
            fontFamily: "'Courier New', monospace",
            borderRadius: 10,
            border: `2px solid ${digits[i].trim() ? 'var(--indigo-l)' : 'var(--border)'}`,
            background: 'var(--surface2)',
            color: 'var(--text1)',
            outline: 'none',
            transition: 'border-color .15s',
            caretColor: 'transparent',
          }}
        />
      ))}
    </div>
  )
}

// ─── Countdown timer for resend cooldown ─────────────────────────────────
function useCountdown(seconds) {
  const [left, setLeft] = useState(seconds)
  useEffect(() => {
    setLeft(seconds)
    const id = setInterval(() => setLeft(n => Math.max(0, n - 1)), 1000)
    return () => clearInterval(id)
  }, [seconds])
  return left
}

// ─── Main page ────────────────────────────────────────────────────────────
export default function AuthPage() {
  const navigate = useNavigate()

  // 'login' | 'register' | 'otp'
  const [mode, setMode]       = useState('login')
  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp]         = useState('')
  const [error, setError]     = useState(null)
  const [info, setInfo]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Resend cooldown — starts at 60 s after OTP is sent
  const [cooldownKey, setCooldownKey] = useState(0)
  const cooldown = useCountdown(cooldownKey === 0 ? 0 : 60)

  // ── Handlers ──────────────────────────────────────────────────────────

  async function handleLoginSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const data = await login(email, password)
      saveAuth(data.user)
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleRegisterSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await registerInitiate(name, email, password)
      setOtp('')
      setCooldownKey(k => k + 1)
      setMode('otp')
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleOtpSubmit(e) {
    e.preventDefault()
    if (otp.replace(/\s/g, '').length < 6) {
      setError('Please enter all 6 digits')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const data = await registerVerify(email, otp.replace(/\s/g, ''))
      saveAuth(data.user)
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (cooldown > 0) return
    setError(null)
    setInfo(null)
    setLoading(true)
    try {
      await registerResend(email)
      setOtp('')
      setCooldownKey(k => k + 1)
      setInfo('A new code has been sent to your inbox.')
    } catch (err) {
      setError(err.response?.data?.error || 'Could not resend. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function switchMode(next) {
    setMode(next)
    setError(null)
    setInfo(null)
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 20, right: 24, zIndex: 10 }}><ThemeToggle /></div>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(99,102,241,.12) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div className="fade-up" style={{ width: '100%', maxWidth: 420, padding: 24, position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div
            style={{ fontSize: 24, fontWeight: 900, color: 'var(--indigo-l)', letterSpacing: '-.3px', marginBottom: 6, cursor: 'pointer' }}
            onClick={() => navigate('/')}
          >
            QuizPulse
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.4px', marginBottom: 4 }}>
            {mode === 'login'    ? 'Welcome back'        :
             mode === 'register' ? 'Create your account' :
                                   'Verify your email'}
          </div>
          <div style={{ fontSize: 14, color: 'var(--text2)' }}>
            {mode === 'login'    ? 'Sign in to your host console'    :
             mode === 'register' ? 'Get started hosting quizzes'     :
                                   `We sent a 6-digit code to ${email}`}
          </div>
        </div>

        {/* Card */}
        <div className="glass" style={{ borderRadius: 'var(--r3)', padding: 32 }}>

          {/* ── OTP step ── */}
          {mode === 'otp' ? (
            <>
              {error && <div className="error-msg">{error}</div>}
              {info  && (
                <div style={{
                  background: 'rgba(99,102,241,.1)', border: '1px solid rgba(99,102,241,.25)',
                  borderRadius: 8, padding: '10px 14px', fontSize: 13,
                  color: 'var(--indigo-l)', marginBottom: 14,
                }}>
                  {info}
                </div>
              )}

              <form onSubmit={handleOtpSubmit}>
                <label className="section-label" style={{ display: 'block', textAlign: 'center', marginBottom: 4 }}>
                  Verification code
                </label>
                <OtpInput value={otp} onChange={setOtp} disabled={loading} />

                <button
                  className="btn btn-primary btn-lg"
                  style={{ width: '100%' }}
                  type="submit"
                  disabled={loading || otp.replace(/\s/g, '').length < 6}
                >
                  {loading
                    ? <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                    : <><span>Verify &amp; create account</span><span className="mat">check_circle</span></>
                  }
                </button>
              </form>

              {/* Resend + back */}
              <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: 'var(--text3)' }}>
                Didn&apos;t receive it?{' '}
                <span
                  onClick={handleResend}
                  style={{
                    color: cooldown > 0 ? 'var(--text3)' : 'var(--indigo-l)',
                    cursor: cooldown > 0 ? 'default' : 'pointer',
                    fontWeight: 700,
                  }}
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                </span>
              </div>
              <div style={{ textAlign: 'center', marginTop: 10, fontSize: 12, color: 'var(--text3)' }}>
                <span
                  onClick={() => switchMode('register')}
                  style={{ color: 'var(--indigo-l)', cursor: 'pointer', fontWeight: 700 }}
                >
                  ← Back
                </span>
              </div>
            </>
          ) : (
            <>
              {/* ── Login / Register tabs ── */}
              <div className="auth-seg">
                <button
                  id="seg-login"
                  className={`auth-seg-btn ${mode === 'login' ? 'on' : ''}`}
                  onClick={() => switchMode('login')}
                >
                  Sign in
                </button>
                <button
                  id="seg-register"
                  className={`auth-seg-btn ${mode === 'register' ? 'on' : ''}`}
                  onClick={() => switchMode('register')}
                >
                  Create account
                </button>
              </div>

              {error && <div className="error-msg">{error}</div>}

              {mode === 'login' ? (
                <form onSubmit={handleLoginSubmit}>
                  <div style={{ marginBottom: 14 }}>
                    <label className="section-label">Email</label>
                    <input
                      id="input-email"
                      className="input"
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div style={{ marginBottom: 20 }}>
                    <label className="section-label">Password</label>
                    <div className="input-with-icon">
                      <input
                        id="input-password"
                        className="input"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        className="input-icon-btn"
                        onClick={() => setShowPassword(!showPassword)}
                        tabIndex="-1"
                      >
                        <span className="mat">{showPassword ? 'visibility_off' : 'visibility'}</span>
                      </button>
                    </div>
                  </div>
                  <button
                    id="btn-auth-submit"
                    className="btn btn-primary btn-lg"
                    style={{ width: '100%' }}
                    type="submit"
                    disabled={loading}
                  >
                    {loading
                      ? <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                      : <><span>Sign in</span><span className="mat">arrow_forward</span></>
                    }
                  </button>
                </form>
              ) : (
                <form onSubmit={handleRegisterSubmit}>
                  <div style={{ marginBottom: 14 }}>
                    <label className="section-label">Name</label>
                    <input
                      id="input-name"
                      className="input"
                      placeholder="Your name"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      required
                    />
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label className="section-label">Email</label>
                    <input
                      id="input-email"
                      className="input"
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div style={{ marginBottom: 20 }}>
                    <label className="section-label">Password</label>
                    <div className="input-with-icon">
                      <input
                        id="input-password"
                        className="input"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                        minLength={6}
                      />
                      <button
                        type="button"
                        className="input-icon-btn"
                        onClick={() => setShowPassword(!showPassword)}
                        tabIndex="-1"
                      >
                        <span className="mat">{showPassword ? 'visibility_off' : 'visibility'}</span>
                      </button>
                    </div>
                  </div>
                  <button
                    id="btn-auth-submit"
                    className="btn btn-primary btn-lg"
                    style={{ width: '100%' }}
                    type="submit"
                    disabled={loading}
                  >
                    {loading
                      ? <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                      : <><span>Send verification code</span><span className="mat">mail</span></>
                    }
                  </button>
                </form>
              )}

              <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'var(--text3)' }}>
                Player?{' '}
                <span
                  style={{ color: 'var(--indigo-l)', cursor: 'pointer', fontWeight: 700 }}
                  onClick={() => navigate('/join')}
                >
                  Join a quiz →
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import socket from '../socket/socket'
import useQuizStore from '../store/useQuizStore'
import LiveBarChart from '../components/LiveBarChart'
import CountdownTimer from '../components/CountdownTimer'
import Leaderboard from '../components/Leaderboard'
import ThemeToggle from '../components/ThemeToggle'
import { verifyHostSession } from '../api/quizApi'

export default function HostLive() {
  const { roomCode } = useParams()
  const navigate = useNavigate()
  const {
    currentQuestion, setQuestion,
    votes, setVotes,
    leaderboard, setLeaderboard,
    status, setStatus,
    timer, setTimer,
  } = useQuizStore()

  const [correctIndex, setCorrectIndex] = useState(null)
  const [totalAnswered, setTotalAnswered] = useState(0)
  const [totalPlayers, setTotalPlayers] = useState(0)
  const [authChecked, setAuthChecked] = useState(false)

  // ── Step 1: verify ownership before doing anything else ──────────────────
  useEffect(() => {
    verifyHostSession(roomCode)
      .then(() => setAuthChecked(true))
      .catch((err) => {
        const status = err?.response?.status
        if (status === 403) {
          navigate('/dashboard', { replace: true, state: { error: 'You do not have access to that session.' } })
        } else {
          navigate('/dashboard', { replace: true })
        }
      })
  }, [roomCode, navigate])

  // ── Step 2: socket setup — only runs after auth check passes ─────────────
  useEffect(() => {
    if (!authChecked) return
    // Connect (safe to call if already connected)
    if (!socket.connected) socket.connect()

    function onQuestion(payload) {
      setQuestion(payload)
      setStatus('live')
      setCorrectIndex(null)
      setTotalAnswered(0)
    }
    function onStats({ votes, totalAnswered, totalPlayers }) {
      setVotes(votes)
      setTotalAnswered(totalAnswered || 0)
      setTotalPlayers(totalPlayers || 0)
    }
    function onResult({ correctIndex: ci, votes, leaderboard }) {
      setStatus('revealing')
      setVotes(votes)
      setLeaderboard(leaderboard)
      setCorrectIndex(ci)
    }
    function onTick({ remaining }) {
      setTimer(remaining)
    }
    function onEnded({ finalLeaderboard, sessionId }) {
      setLeaderboard(finalLeaderboard || [])
      navigate(`/results/${sessionId}`)
    }
    function onReconnect() {
      socket.emit('host:join', { roomCode })
    }

    // Remove stale listeners first
    socket.off('quiz:question', onQuestion)
    socket.off('quiz:stats', onStats)
    socket.off('quiz:result', onResult)
    socket.off('timer:tick', onTick)
    socket.off('quiz:ended', onEnded)
    socket.off('connect', onReconnect)

    // Register fresh listeners
    socket.on('quiz:question', onQuestion)
    socket.on('quiz:stats', onStats)
    socket.on('quiz:result', onResult)
    socket.on('timer:tick', onTick)
    socket.on('quiz:ended', onEnded)
    socket.on('connect', onReconnect)

    // Emit host:join to register/re-register with server
    socket.emit('host:join', { roomCode })

    return () => {
      socket.off('quiz:question', onQuestion)
      socket.off('quiz:stats', onStats)
      socket.off('quiz:result', onResult)
      socket.off('timer:tick', onTick)
      socket.off('quiz:ended', onEnded)
      socket.off('connect', onReconnect)
      socket.disconnect()
    }
  }, [roomCode, authChecked])

  function handleReveal() {
    socket.emit('quiz:reveal', { roomCode })
  }

  function handleNext() {
    socket.emit('quiz:next', { roomCode })
  }

  function handleEnd() {
    socket.emit('quiz:end', { roomCode })
  }

  const q = currentQuestion
  const progress = q ? ((q.index + 1) / q.totalQuestions) * 100 : 0
  const responseRate = totalPlayers > 0 ? Math.round((totalAnswered / totalPlayers) * 100) : 0
  const totalVotes = votes.reduce((s, v) => s + v, 0)
  const correctVotes = correctIndex !== null && votes[correctIndex] ? votes[correctIndex] : 0
  const accuracy = totalVotes > 0 ? Math.round((correctVotes / totalVotes) * 100) : 0

  // Don't render host UI until ownership is confirmed — prevents flash of content
  if (!authChecked) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      {/* Topbar */}
      <div className="topbar">
        <div className="topbar-logo">QuizPulse</div>
        <div className="topbar-sep" />
        <div className="badge badge-live">
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f87171', animation: 'dotB 1s infinite', display: 'inline-block' }} />
          LIVE
        </div>
        {q && (
          <div style={{ flex: 1, maxWidth: 200, margin: '0 16px' }}>
            <div className="progress-wrap">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div style={{ fontSize: 10, color: 'var(--text3)', textAlign: 'right', marginTop: 3 }}>
              Q{q.index + 1} of {q.totalQuestions}
            </div>
          </div>
        )}
        <div className="topbar-right">
          <ThemeToggle />
          {timer !== null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.05)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', padding: '6px 12px' }}>
              <span className="mat sm" style={{ color: 'var(--indigo-l)' }}>timer</span>
              <span className="mono" style={{ fontSize: 16, fontWeight: 900, color: timer <= 5 ? 'var(--red)' : 'var(--indigo-l)' }}>{timer}</span>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>sec</span>
            </div>
          )}
          <button className="btn btn-danger btn-sm" onClick={handleEnd}>
            <span className="mat sm">stop</span>End
          </button>
        </div>
      </div>

      <div className="host-layout">
        {/* Sidebar */}
        <div className="sidebar">
          <button className="nav-item active">
            <span className="mat sm">bar_chart</span>Live Stats
          </button>
          <button className="nav-item">
            <span className="mat sm">leaderboard</span>Leaderboard
          </button>
          <div className="nav-sep" />

          {/* Mini leaderboard */}
          {leaderboard.length > 0 && (
            <div style={{ padding: '0 4px' }}>
              <div className="section-label" style={{ marginBottom: 8 }}>Top Players</div>
              {leaderboard.slice(0, 5).map((player, idx) => {
                const rankClass = idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : ''
                return (
                  <div key={player.playerId || idx} className="lb-row" style={{ padding: '8px 10px', marginBottom: 4 }}>
                    <div className={`lb-rank ${rankClass}`} style={{ width: 20, fontSize: 12 }}>{player.rank || idx + 1}</div>
                    <div className="lb-name" style={{ fontSize: 12 }}>{player.name}</div>
                    <div className="lb-score" style={{ fontSize: 11 }}>{player.score}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Main */}
        <div className="main-content scroll-area">
          {!q ? (
            <div className="loading-center">
              <div style={{ textAlign: 'center' }}>
                <div className="dots" style={{ marginBottom: 16 }}>
                  <div className="dot" /><div className="dot" /><div className="dot" />
                </div>
                <p style={{ color: 'var(--text2)' }}>Waiting for quiz to start...</p>
              </div>
            </div>
          ) : (
            <div style={{ maxWidth: 760 }}>
              {/* Question header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.8px', color: 'var(--indigo-l)', marginBottom: 8 }}>
                    Question {q.index + 1} of {q.totalQuestions}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.3px', lineHeight: 1.3, maxWidth: 580 }}>
                    {q.text}
                  </div>
                </div>
                <div style={{ flexShrink: 0, textAlign: 'right' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px', color: 'var(--text3)', marginBottom: 4 }}>
                    Response rate
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--green-l)' }}>
                    {responseRate}%
                  </div>
                </div>
              </div>

              {/* Timer bar */}
              <CountdownTimer remaining={timer} timeLimit={q.timeLimit} />

              {/* Stats row */}
              <div className="grid-4" style={{ marginBottom: 28, marginTop: 20, gap: 12 }}>
                <div className="stat-card" style={{ padding: '14px 16px' }}>
                  <div className="stat-label">Answered</div>
                  <div className="stat-val" style={{ fontSize: 22, color: 'var(--indigo-l)' }}>{totalAnswered}</div>
                </div>
                <div className="stat-card" style={{ padding: '14px 16px' }}>
                  <div className="stat-label">Waiting</div>
                  <div className="stat-val" style={{ fontSize: 22 }}>{Math.max(0, totalPlayers - totalAnswered)}</div>
                </div>
                <div className="stat-card" style={{ padding: '14px 16px' }}>
                  <div className="stat-label">Correct</div>
                  <div className="stat-val" style={{ fontSize: 22, color: 'var(--green-l)' }}>{correctIndex !== null ? correctVotes : '—'}</div>
                </div>
                <div className="stat-card" style={{ padding: '14px 16px' }}>
                  <div className="stat-label">Accuracy</div>
                  <div className="stat-val" style={{ fontSize: 22 }}>{correctIndex !== null ? `${accuracy}%` : '—'}</div>
                </div>
              </div>

              {/* Bar chart */}
              <div className="section-label" style={{ marginBottom: 12 }}>Response Distribution</div>
              <LiveBarChart votes={votes} options={q.options} correctIndex={correctIndex} />

              {/* Controls */}
              <div style={{ display: 'flex', gap: 12, marginTop: 28, justifyContent: 'center' }}>
                {status === 'live' && (
                  <button className="btn btn-primary btn-lg" onClick={handleReveal}>
                    <span className="mat">visibility</span>Reveal Answer
                  </button>
                )}
                {status === 'revealing' && (
                  <>
                    {q.index < q.totalQuestions - 1 && (
                      <button className="btn btn-primary btn-lg" onClick={handleNext}>
                        <span className="mat">arrow_forward</span>Next Question
                      </button>
                    )}
                    <button className="btn btn-danger btn-lg" onClick={handleEnd}>
                      <span className="mat">stop</span>End Quiz
                    </button>
                  </>
                )}
              </div>

              {/* Leaderboard after reveal */}
              {status === 'revealing' && leaderboard.length > 0 && (
                <div style={{ marginTop: 32 }}>
                  <div className="section-label" style={{ marginBottom: 12 }}>Leaderboard</div>
                  <Leaderboard data={leaderboard} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
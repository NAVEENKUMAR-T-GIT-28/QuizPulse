import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import socket from '../socket/socket'
import useQuizStore from '../store/useQuizStore'
import QRCodeDisplay from '../components/QRCodeDisplay'
import ThemeToggle from '../components/ThemeToggle'
import { verifyHostSession, deleteSession } from '../api/quizApi'

const AVATAR_COLORS = [
  { bg: 'rgba(99,102,241,.15)', color: 'var(--indigo-l)' },
  { bg: 'rgba(34,197,94,.12)', color: 'var(--green-l)' },
  { bg: 'rgba(245,158,11,.12)', color: '#fbbf24' },
  { bg: 'rgba(239,68,68,.1)', color: '#f87171' },
  { bg: 'rgba(168,85,247,.12)', color: '#c084fc' },
  { bg: 'rgba(14,165,233,.12)', color: '#38bdf8' },
]

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export default function HostLobby() {
  const { roomCode } = useParams()
  const navigate = useNavigate()
  const { players, setPlayers } = useQuizStore()
  const [authChecked, setAuthChecked] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sessionId, setSessionId] = useState(null)
  const [showCancelModal, setShowCancelModal] = useState(false)

  // ── Step 1: verify ownership before doing anything else ──────────────────
  useEffect(() => {
    verifyHostSession(roomCode)
      .then((data) => {
        setAuthChecked(true)
        setSessionId(data.sessionId)
      })
      .catch((err) => {
        const status = err?.response?.status
        if (status === 403) {
          navigate('/dashboard', { replace: true, state: { error: 'You do not have access to that session.' } })
        } else if (status === 404) {
          navigate('/dashboard', { replace: true, state: { error: 'Session not found.' } })
        } else {
          navigate('/dashboard', { replace: true })
        }
      })
  }, [roomCode, navigate])

  // ── Step 2: socket setup — only runs after auth check passes ─────────────
  useEffect(() => {
    if (!authChecked) return
    // Connect only once
    if (!socket.connected) {
      socket.connect()
    }

    function onHostJoined({ players }) {
      setPlayers(players || [])
    }

    function onRoomPlayers({ players }) {
      setPlayers(players || [])
    }

    // When the server broadcasts the first question after quiz:start,
    // store it and navigate to HostLive
    function onQuizQuestion(payload) {
      useQuizStore.getState().setQuestion(payload)
      useQuizStore.getState().setStatus('live')
      navigate(`/host/${roomCode}`)
    }

    // Remove any stale listeners first
    socket.off('host:joined', onHostJoined)
    socket.off('room:players', onRoomPlayers)
    socket.off('quiz:question', onQuizQuestion)

    // Register fresh listeners
    socket.on('host:joined', onHostJoined)
    socket.on('room:players', onRoomPlayers)
    socket.on('quiz:question', onQuizQuestion)

    // Emit join — always emit to re-register with server on reconnect
    socket.emit('host:join', { roomCode })

    // Handle reconnection: re-emit host:join so server updates roomHosts
    function onReconnect() {
      socket.emit('host:join', { roomCode })
    }
    socket.on('connect', onReconnect)

    return () => {
      socket.off('host:joined', onHostJoined)
      socket.off('room:players', onRoomPlayers)
      socket.off('quiz:question', onQuizQuestion)
      socket.off('connect', onReconnect)
      // Do NOT disconnect here — socket is needed in HostLive
    }
  }, [roomCode, setPlayers, navigate, authChecked])

  function handleStart() {
    socket.emit('quiz:start', { roomCode })
    // Navigation happens when server broadcasts quiz:question (handled in useEffect)
  }

  function handleCopyLink() {
    const url = `${window.location.origin}/join/${roomCode}`
    navigator.clipboard.writeText(url).catch(() => { })
  }

  async function handleCancelSession() {
    try {
      socket.emit('host:cancel', { roomCode }) // Broadcast session cancel early
      if (sessionId) {
        await deleteSession(sessionId)
      }
      socket.disconnect()
      navigate('/dashboard')
    } catch (err) {
      alert('Failed to cancel session.')
    }
  }

  // Don't render host UI until ownership is confirmed — prevents flash of content
  if (!authChecked) return null

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {/* Topbar */}
      <div className="topbar">
        <button className="hamburger" onClick={() => setSidebarOpen(true)}>
          <span className="mat">menu</span>
        </button>
        <div className="topbar-logo">QuizPulse</div>
        <div className="topbar-sep" />
        <span style={{ fontSize: 13, color: 'var(--text2)' }}>Lobby</span>
        <div className="topbar-right">
          <ThemeToggle />
          <div className="badge badge-indigo">
            <span className="dots" style={{ zoom: 0.7 }}>
              <div className="dot" /><div className="dot" /><div className="dot" />
            </span>
            Waiting
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => { socket.disconnect(); navigate('/dashboard') }}>
            <span className="mat sm">arrow_back</span><span className="topbar-back-text">Back</span>
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleStart}
            disabled={players.length === 0}
          >
            <span className="mat sm">play_arrow</span><span className="topbar-back-text">Start Quiz</span>
          </button>
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      <div className={`sidebar-overlay${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />

      <div className="host-layout">
        {/* Sidebar */}
        <div className={`sidebar${sidebarOpen ? ' open' : ''}`}>
          <div className="sidebar-mobile-header">
            <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--indigo-l)' }}>QuizPulse</span>
            <button className="sidebar-close" onClick={() => setSidebarOpen(false)}>
              <span className="mat sm">close</span>
            </button>
          </div>
          <button className="nav-item active" onClick={() => setSidebarOpen(false)}>
            <span className="mat sm">sensor_door</span>Lobby
          </button>
          <div className="nav-sep" />
          <div style={{ padding: '8px 12px' }}>
            <div className="section-label">How to join</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
              1. Go to this app<br />
              2. Enter code <strong style={{ color: 'var(--indigo-l)' }}>{roomCode}</strong><br />
              3. Enter your name
            </div>
          </div>
          <div style={{ marginTop: 'auto', paddingTop: 12 }}>
            <button className="btn btn-danger btn-sm" style={{ width: '100%' }} onClick={() => setShowCancelModal(true)}>
              <span className="mat sm">close</span>Cancel
            </button>
          </div>
        </div>

        {/* Main */}
        <div className="main-content scroll-area">
          <div className="lobby-grid">
            {/* Left: code + players */}
            <div>
              <div className="page-header">
                <div className="page-title">Waiting Room</div>
                <div className="page-sub">Share the code below — players can join anytime</div>
              </div>

              {/* Room code */}
              <div className="room-code-display" style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text3)', marginBottom: 8 }}>
                  Room Code
                </div>
                <div className="room-code-num">{roomCode}</div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14 }}>
                  <button className="btn btn-ghost btn-sm" onClick={handleCopyLink}>
                    <span className="mat sm">content_copy</span>Copy link
                  </button>
                </div>
              </div>

              {/* Players */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <div className="section-label" style={{ marginBottom: 0 }}>Players</div>
                <span className="badge badge-indigo">{players.length} joined</span>
              </div>

              {players.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>
                  <div className="dots" style={{ marginBottom: 16 }}>
                    <div className="dot" /><div className="dot" /><div className="dot" />
                  </div>
                  <p>Waiting for players to join...</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 10 }}>
                  {players.map((player, idx) => {
                    const c = AVATAR_COLORS[idx % AVATAR_COLORS.length]
                    const playerName = player.name || player.playerName || 'Player'
                    return (
                      <div key={player.id || player.playerId || idx} className="fade-up" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                        <div className="lb-av" style={{ background: c.bg, color: c.color, width: 44, height: 44, fontSize: 13 }}>
                          {getInitials(playerName)}
                        </div>
                        <span style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 600, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
                          {playerName}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Right: QR */}
            <div>
              <div className="glass" style={{ borderRadius: 'var(--r2)', padding: 20, textAlign: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Scan to join</div>
                <QRCodeDisplay roomCode={roomCode} />
              </div>
              <button
                className="btn btn-primary btn-lg"
                style={{ width: '100%', marginBottom: 8 }}
                onClick={handleStart}
                disabled={players.length === 0}
              >
                <span className="mat sm">play_arrow</span>Start Quiz
              </button>
              <button
                className="btn btn-danger btn-outline btn-lg"
                style={{ width: '100%' }}
                onClick={() => setShowCancelModal(true)}
              >
                <span className="mat sm">close</span>Cancel Quiz
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Cancel Modal */}
      {showCancelModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass fade-up" style={{ maxWidth: 400, width: '90%', padding: '32px 24px', textAlign: 'center', borderRadius: 'var(--r2)' }}>
            <div style={{ marginBottom: 16 }}>
              <span className="mat xl" style={{ color: 'var(--red)', fontSize: 48 }}>warning</span>
            </div>
            <h2 style={{ fontSize: 20, marginBottom: 12 }}>Cancel Quiz Session?</h2>
            <p style={{ color: 'var(--text2)', marginBottom: 24, fontSize: 14 }}>
              Are you sure you want to cancel this session? This will permanently delete the room and disconnect all players.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button className="btn btn-ghost" onClick={() => setShowCancelModal(false)}>
                No, keep it
              </button>
              <button className="btn btn-danger" onClick={handleCancelSession}>
                Yes, cancel session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import socket from '../socket/socket'
import useQuizStore from '../store/useQuizStore'
import ThemeToggle from '../components/ThemeToggle'
import { setActiveSession, clearActiveSession } from '../context/ActiveSessionContext'

export default function PlayerLobby() {
  const { roomCode } = useParams()
  const navigate = useNavigate()
  
  const { playerId: storedPlayerId, playerName: storedPlayerName, setQuestion, setStatus, resetSession } = useQuizStore()

  // Fallback to localStorage if Zustand store was wiped by a browser refresh
  const playerId   = storedPlayerId   || localStorage.getItem('qp_playerId')
  const playerName = storedPlayerName || localStorage.getItem('qp_playerName')
  const [quizTitle, setQuizTitle] = useState('')
  const [showCanceledModal, setShowCanceledModal] = useState(false)

  function handleExit() {
    clearActiveSession()

    let finished = false
    const finalize = () => {
      if (finished) return
      finished = true
      try { socket.disconnect() } catch (e) {}
      localStorage.removeItem('qp_roomCode')
      localStorage.removeItem('qp_playerId')
      resetSession()
      navigate('/join')
    }

    try {
      if (socket && socket.connected) {
        // Request server to mark player inactive, then disconnect when ack'd.
        // Fallback timeout in case the ack doesn't arrive.
        socket.emit('player:leave', { roomCode, playerId }, (res) => {
          finalize()
        })
        setTimeout(finalize, 2000)
      } else {
        finalize()
      }
    } catch (err) {
      console.error('handleExit error:', err)
      finalize()
    }
  }

  useEffect(() => {
    function doJoin() {
      socket.emit('player:join', { roomCode, playerName, playerId })
    }

    function onPlayerJoined({ quizTitle: title, status }) {
      setQuizTitle(title || '')
      // Persist for reconnection — localStorage survives tab close
      localStorage.setItem('qp_roomCode', roomCode)
      localStorage.setItem('qp_playerId', playerId)
      localStorage.setItem('qp_playerName', playerName)
      setActiveSession({ role: 'player', roomCode, playerId, playerName })
      if (status === 'live') navigate(`/play/${roomCode}`)
    }

    function onQuizQuestion(payload) {
      setQuestion(payload)
      setStatus('live')
      navigate(`/play/${roomCode}`)
    }

    function onError({ message }) {
      alert(message)
      navigate('/join')
    }

    function onSessionCanceled() {
      setShowCanceledModal(true)
      clearActiveSession()
      socket.disconnect()
      localStorage.removeItem('qp_roomCode')
      localStorage.removeItem('qp_playerId')
      resetSession()
    }

    // Remove stale listeners first
    socket.off('player:joined', onPlayerJoined)
    socket.off('quiz:question', onQuizQuestion)
    socket.off('error', onError)
    socket.off('session_canceled', onSessionCanceled)

    // Register fresh listeners
    socket.on('player:joined', onPlayerJoined)
    socket.on('quiz:question', onQuizQuestion)
    socket.on('error', onError)
    socket.on('session_canceled', onSessionCanceled)

    // Emit player:join only once the socket is confirmed connected
    // (socket.connect() is async — emitting immediately is not safe)
    if (socket.connected) {
      doJoin()
    } else {
      socket.once('connect', doJoin)
      socket.connect()
    }

    return () => {
      socket.off('player:joined', onPlayerJoined)
      socket.off('quiz:question', onQuizQuestion)
      socket.off('error', onError)
      socket.off('session_canceled', onSessionCanceled)
      socket.off('connect', doJoin)   // remove one-time listener on cleanup
      // Do NOT disconnect — socket needed in PlayerGame
    }
  }, [roomCode])

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 20, right: 24, zIndex: 10 }}><ThemeToggle /></div>
      {/* Background */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(99,102,241,.12) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div className="fade-up" style={{ textAlign: 'center', maxWidth: 460, padding: 24, position: 'relative', zIndex: 1 }}>
        {/* Logo */}
        <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--indigo-l)', letterSpacing: '-.3px', marginBottom: 32 }}>
          QuizPulse
        </div>

        {/* Pulse animation */}
        <div style={{ marginBottom: 32 }}>
          <div
            className="pulse-icon"
            style={{
              width: 80, height: 80, borderRadius: '50%',
              background: 'rgba(99,102,241,.1)', border: '2px solid rgba(99,102,241,.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto',
            }}
          >
            <span className="mat xl" style={{ color: 'var(--indigo-l)', fontSize: 36 }}>sports_esports</span>
          </div>
        </div>

        {/* Quiz title */}
        {quizTitle && (
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>{quizTitle}</div>
        )}

        {/* Room code */}
        <div className="badge badge-indigo" style={{ padding: '6px 16px', fontSize: 14, marginBottom: 20, letterSpacing: 3 }}>
          {roomCode}
        </div>

        {/* Waiting message */}
        <div style={{ fontSize: 16, color: 'var(--text2)', marginBottom: 12 }}>
          Waiting for the host to start...
        </div>

        {/* Dots */}
        <div className="dots" style={{ marginBottom: 32 }}>
          <div className="dot" /><div className="dot" /><div className="dot" />
        </div>

        {/* Player info */}
        <div className="glass" style={{ borderRadius: 'var(--r2)', padding: '16px 24px', display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <div
            className="lb-av"
            style={{ background: 'rgba(99,102,241,.15)', color: 'var(--indigo-l)', width: 36, height: 36, fontSize: 13 }}
          >
            {playerName ? playerName.slice(0, 2).toUpperCase() : '??'}
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}>
              Joined as
            </div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>
              {playerName || 'Anonymous'}
            </div>
          </div>
        </div>

        {/* Exit Button */}
        <div>
          <button
            onClick={handleExit}
            className="btn btn-outline"
            style={{ padding: '8px 24px', fontSize: 14, color: 'var(--text3)', borderColor: 'var(--border)' }}
          >
            Exit Quiz
          </button>
        </div>
      </div>

      {/* Canceled Modal */}
      {showCanceledModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass fade-up" style={{ maxWidth: 400, width: '90%', padding: '32px 24px', textAlign: 'center', borderRadius: 'var(--r2)' }}>
            <div style={{ marginBottom: 16 }}>
              <span className="mat xl" style={{ color: 'var(--amber)', fontSize: 48 }}>info</span>
            </div>
            <h2 style={{ fontSize: 20, marginBottom: 12 }}>Session Canceled</h2>
            <p style={{ color: 'var(--text2)', marginBottom: 24, fontSize: 14 }}>
              The host has canceled this quiz session. You will be redirected to the join screen.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={() => navigate('/join')}>
                Okay
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

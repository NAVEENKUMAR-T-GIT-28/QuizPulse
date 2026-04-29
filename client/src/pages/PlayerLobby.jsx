import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import socket from '../socket/socket'
import useQuizStore from '../store/useQuizStore'

export default function PlayerLobby() {
  const { roomCode } = useParams()
  const navigate = useNavigate()
  const { playerId, playerName, setQuestion, setStatus } = useQuizStore()
  const [quizTitle, setQuizTitle] = useState('')

  useEffect(() => {
    if (!socket.connected) socket.connect()

    function onPlayerJoined({ quizTitle: title, status }) {
      setQuizTitle(title || '')
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

    // Remove stale listeners first
    socket.off('player:joined', onPlayerJoined)
    socket.off('quiz:question', onQuizQuestion)
    socket.off('error', onError)

    // Register fresh listeners
    socket.on('player:joined', onPlayerJoined)
    socket.on('quiz:question', onQuizQuestion)
    socket.on('error', onError)

    // Register with the server
    socket.emit('player:join', {
      roomCode,
      playerName,
      playerId,
    })

    return () => {
      socket.off('player:joined', onPlayerJoined)
      socket.off('quiz:question', onQuizQuestion)
      socket.off('error', onError)
      // Do NOT disconnect — socket needed in PlayerGame
    }
  }, [roomCode])

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
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
        <div className="glass" style={{ borderRadius: 'var(--r2)', padding: '16px 24px', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
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
      </div>
    </div>
  )
}

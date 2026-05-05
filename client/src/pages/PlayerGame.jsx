import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import socket from '../socket/socket'
import useQuizStore from '../store/useQuizStore'
import CountdownTimer from '../components/CountdownTimer'
import QuestionCard from '../components/QuestionCard'
import Leaderboard from '../components/Leaderboard'
import ThemeToggle from '../components/ThemeToggle'
import { clearActiveSession } from '../context/ActiveSessionContext'

export default function PlayerGame() {
  const { roomCode } = useParams()
  const navigate = useNavigate()
  const {
    currentQuestion, setQuestion,
    myAnswer, setMyAnswer,
    leaderboard, setLeaderboard,
    status, setStatus,
    timer, setTimer,
    playerId, isCorrect, setMyResult,
  } = useQuizStore()

  const [roomStatus, setRoomStatus] = useState('checking') // 'checking' | 'valid' | 'invalid' | 'ended'
  const [correctIndex, setCorrectIndex] = useState(null)
  const [answerConfirmed, setAnswerConfirmed] = useState(false)
  const [lastPointsEarned, setLastPointsEarned] = useState(0)

  // 1. Validate room via REST before touching the socket
  useEffect(() => {
    if (!roomCode) {
      navigate('/join', { replace: true })
      return
    }

    axios.get(`/api/session/${roomCode}`)
      .then(res => {
        if (res.data.status === 'ended') {
          setRoomStatus('ended')
        } else {
          setRoomStatus('valid')
        }
      })
      .catch(err => {
        const httpStatus = err.response?.status
        if (httpStatus === 404) {
          setRoomStatus('invalid')
        } else if (httpStatus === 410) {
          setRoomStatus('ended')
        } else {
          setRoomStatus('invalid')
        }
      })
  }, [roomCode, navigate])

  // 2. Socket connection and events (only if room is valid)
  useEffect(() => {
    if (roomStatus !== 'valid') return

    if (!socket.connected) socket.connect()

    function onQuestion(payload) {
      setQuestion(payload)
      setStatus('live')
      setCorrectIndex(null)
      setAnswerConfirmed(false)
      setLastPointsEarned(0)
    }

    function onResult({ correctIndex: ci, leaderboard: lb, pointsMap }) {
      setCorrectIndex(ci)
      setLeaderboard(lb)
      setStatus('revealing')
      const currentAnswer = useQuizStore.getState().myAnswer
      const pid = useQuizStore.getState().playerId
      const pointsEarned = (pointsMap && pid && pointsMap[pid]) ? pointsMap[pid] : 0
      const correct = currentAnswer !== null && currentAnswer === ci
      setMyResult(correct, pointsEarned)
      setLastPointsEarned(pointsEarned)
    }

    function onTick({ remaining }) {
      setTimer(remaining)
    }

    function onAnswerReceived() {
      setAnswerConfirmed(true)
    }

    function onEnded({ finalLeaderboard, sessionId }) {
      clearActiveSession()
      localStorage.setItem('qp_session_ended', JSON.stringify({
        roomCode,
        sessionId,
        finalLeaderboard: finalLeaderboard || [],
      }))
      setLeaderboard(finalLeaderboard || [])
      setStatus('ended')
    }

    function onPlayerJoined({ status: sessionStatus, currentQuestion: cq }) {
      if (cq && (sessionStatus === 'live' || sessionStatus === 'revealing')) {
        setQuestion(cq)
        setStatus(sessionStatus)
      }
      if (sessionStatus === 'ended') {
        setStatus('ended')
      }
    }

    function onReconnect() {
      const state = useQuizStore.getState()
      const pid  = state.playerId   || localStorage.getItem('qp_playerId')
      const name = state.playerName || localStorage.getItem('qp_playerName')

      if (pid && name && roomCode) {
        if (!state.playerId)   useQuizStore.getState().setPlayerId(pid)
        if (!state.playerName) useQuizStore.getState().setPlayerName(name)
        socket.emit('player:join', { roomCode, playerName: name, playerId: pid })
      }
    }

    function onError({ message }) {
      console.error('Socket error:', message)
      navigate('/join', { replace: true })
    }

    socket.on('quiz:question',   onQuestion)
    socket.on('quiz:result',     onResult)
    socket.on('timer:tick',      onTick)
    socket.on('answer:received', onAnswerReceived)
    socket.on('quiz:ended',      onEnded)
    socket.on('player:joined',   onPlayerJoined)
    socket.on('connect',         onReconnect)
    socket.on('error',           onError)

    return () => {
      socket.off('quiz:question',   onQuestion)
      socket.off('quiz:result',     onResult)
      socket.off('timer:tick',      onTick)
      socket.off('answer:received', onAnswerReceived)
      socket.off('quiz:ended',      onEnded)
      socket.off('player:joined',   onPlayerJoined)
      socket.off('connect',         onReconnect)
      socket.off('error',           onError)
      socket.disconnect()
    }
  }, [roomStatus, roomCode, navigate, setQuestion, setStatus, setLeaderboard, setMyResult, setTimer])

  const handleAnswer = (optionIndex) => {
    if (myAnswer !== null || status !== 'live') return
    setMyAnswer(optionIndex)
    socket.emit('player:answer', {
      roomCode,
      questionIndex: currentQuestion.index,
      optionIndex,
      playerId,
    })
  }

  const handlePlayAgain = () => {
    useQuizStore.getState().resetSession()
    localStorage.removeItem('qp_session_ended')
    localStorage.removeItem('qp_active_session')
    localStorage.removeItem('qp_playerId')
    localStorage.removeItem('qp_playerName')
    localStorage.removeItem('qp_roomCode')
    socket.disconnect()
    navigate('/join')
  }

  // ─────────────────────────────────────────────
  // Status-based rendering guards
  // ─────────────────────────────────────────────

  if (roomStatus === 'checking') {
    return (
      <div className="center-msg" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    )
  }

  if (roomStatus === 'invalid') {
    return (
      <div className="center-msg" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <span className="mat" style={{ fontSize: 48, color: 'var(--red)' }}>error_outline</span>
        <h2 style={{ margin: 0 }}>Room Not Found</h2>
        <p style={{ color: 'var(--text2)', textAlign: 'center', maxWidth: 300 }}>The code you entered doesn't match an active session.</p>
        <button onClick={() => navigate('/join')} className="btn btn-primary">
          Join a Quiz
        </button>
      </div>
    )
  }

  if (roomStatus === 'ended' || status === 'ended') {
    // Check if we have a cached end state for this room
    const ended = localStorage.getItem('qp_session_ended')
    if (ended) {
      try {
        const parsed = JSON.parse(ended)
        if (parsed.roomCode === roomCode) {
          // Sync store with cache if needed (e.g. on refresh)
          if (status !== 'ended') {
            setLeaderboard(parsed.finalLeaderboard)
            setStatus('ended')
          }
          return (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(99,102,241,.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
              <div className="fade-up" style={{ textAlign: 'center', maxWidth: 500, padding: 24, position: 'relative', zIndex: 1 }}>
                <span className="mat" style={{ fontSize: 64, color: 'var(--amber)', marginBottom: 16, display: 'block' }}>emoji_events</span>
                <h1 style={{ fontSize: 32, marginBottom: 8 }}>Quiz Over!</h1>
                <p style={{ fontSize: 16, color: 'var(--text2)', marginBottom: 32 }}>Thanks for playing</p>
                {leaderboard.length > 0 && (
                  <div style={{ marginBottom: 32, textAlign: 'left' }}>
                    <Leaderboard data={leaderboard} highlightId={playerId} />
                  </div>
                )}
                <button className="btn btn-primary btn-lg" onClick={handlePlayAgain}>
                  <span className="mat">replay</span>Play Again
                </button>
              </div>
            </div>
          )
        }
      } catch {
        localStorage.removeItem('qp_session_ended')
      }
    }
    // No cache or invalid cache, redirect to join
    navigate('/join', { replace: true })
    return null
  }

  // Normal game rendering (status === 'valid')
  const q = currentQuestion

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Top bar */}
      <div className="topbar">
        <div className="topbar-logo">QuizPulse</div>
        <div className="topbar-sep" />
        {q && (
          <>
            <span style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 600 }}>
              Q{q.index + 1} of {q.totalQuestions}
            </span>
            <div style={{ flex: 1, maxWidth: 150, margin: '0 12px' }}>
              <div className="progress-wrap">
                <div className="progress-fill" style={{ width: `${((q.index + 1) / q.totalQuestions) * 100}%` }} />
              </div>
            </div>
          </>
        )}
        <div className="topbar-right">
          <ThemeToggle />
          {timer !== null && status === 'live' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.05)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', padding: '6px 12px' }}>
              <span className="mat sm" style={{ color: timer <= 5 ? 'var(--red)' : 'var(--indigo-l)' }}>timer</span>
              <span className="mono" style={{ fontSize: 16, fontWeight: 900, color: timer <= 5 ? 'var(--red)' : 'var(--indigo-l)' }}>{timer}</span>
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px 20px', maxWidth: 640, margin: '0 auto', width: '100%' }}>
        {!q ? (
          <div className="loading-center">
            <div style={{ textAlign: 'center' }}>
              <div className="dots" style={{ marginBottom: 16 }}>
                <div className="dot" /><div className="dot" /><div className="dot" />
              </div>
              <p style={{ color: 'var(--text2)' }}>Waiting for question...</p>
            </div>
          </div>
        ) : (
          <>
            {status === 'live' && (
              <CountdownTimer remaining={timer} timeLimit={q.timeLimit} />
            )}
            <div style={{ marginTop: 20 }}>
              <QuestionCard
                question={q}
                myAnswer={myAnswer}
                correctIndex={correctIndex}
                onAnswer={handleAnswer}
                disabled={status !== 'live'}
              />
            </div>
            {myAnswer !== null && status === 'live' && (
              <div className="fade-up" style={{ textAlign: 'center', marginTop: 24 }}>
                <div className="dots" style={{ marginBottom: 12 }}>
                  <div className="dot" /><div className="dot" /><div className="dot" />
                </div>
                <p style={{ fontSize: 14, color: 'var(--text2)' }}>
                  {answerConfirmed ? '✓ Answer submitted! Waiting for others...' : 'Submitting...'}
                </p>
              </div>
            )}
            {status === 'revealing' && (
              <div className="fade-up" style={{ marginTop: 20 }}>
                {isCorrect !== null && (
                  <div className={`feedback show ${isCorrect ? 'ok' : 'bad'}`} style={{ display: 'flex' }}>
                    <span className="mat" style={{ color: isCorrect ? 'var(--green-l)' : '#f87171', fontSize: 28 }}>
                      {isCorrect ? 'check_circle' : 'cancel'}
                    </span>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 16, color: isCorrect ? 'var(--green-l)' : '#f87171' }}>
                        {isCorrect ? '✓ Correct!' : '✗ Wrong'}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                        {isCorrect ? `+${lastPointsEarned} pts` : 'Better luck next time'}
                      </div>
                    </div>
                  </div>
                )}
                {leaderboard.length > 0 && (
                  <div style={{ marginTop: 20 }}>
                    <div className="section-label" style={{ marginBottom: 8 }}>Leaderboard</div>
                    <Leaderboard data={leaderboard.slice(0, 5)} highlightId={playerId} />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
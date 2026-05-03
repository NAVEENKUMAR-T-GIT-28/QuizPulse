import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import socket from '../socket/socket'
import useQuizStore from '../store/useQuizStore'
import CountdownTimer from '../components/CountdownTimer'
import QuestionCard from '../components/QuestionCard'
import Leaderboard from '../components/Leaderboard'

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
    myScore,
  } = useQuizStore()

  const [correctIndex, setCorrectIndex] = useState(null)
  const [answerConfirmed, setAnswerConfirmed] = useState(false)
  const [lastPointsEarned, setLastPointsEarned] = useState(0)

  useEffect(() => {
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

    function onEnded({ finalLeaderboard }) {
      setLeaderboard(finalLeaderboard || [])
      setStatus('ended')
      sessionStorage.removeItem('qp_roomCode')
      sessionStorage.removeItem('qp_playerId')
      sessionStorage.removeItem('qp_playerName')
    }

    // ─── NEW: handle the server's response to player:join mid-game ───
    function onPlayerJoined({ status: sessionStatus, currentQuestion: cq }) {
      // If the quiz is already live and the server sent us the current question, render it
      if (cq && (sessionStatus === 'live' || sessionStatus === 'revealing')) {
        setQuestion(cq)
        setStatus(sessionStatus)
      }
      // If status is 'ended', we missed the whole game — show ended screen
      if (sessionStatus === 'ended') {
        setStatus('ended')
      }
    }

    // ─── FIXED: read from sessionStorage, not Zustand (which is wiped on reload) ───
    function onReconnect() {
      // Prefer Zustand (fastest), fall back to sessionStorage (survives reload)
      const state = useQuizStore.getState()
      const pid  = state.playerId   || sessionStorage.getItem('qp_playerId')
      const name = state.playerName || sessionStorage.getItem('qp_playerName')

      if (pid && name && roomCode) {
        // Restore Zustand if it was wiped
        if (!state.playerId)   useQuizStore.getState().setPlayerId(pid)
        if (!state.playerName) useQuizStore.getState().setPlayerName(name)

        socket.emit('player:join', { roomCode, playerName: name, playerId: pid })
      }
    }

    // Remove stale listeners first
    socket.off('quiz:question',  onQuestion)
    socket.off('quiz:result',    onResult)
    socket.off('timer:tick',     onTick)
    socket.off('answer:received',onAnswerReceived)
    socket.off('quiz:ended',     onEnded)
    socket.off('player:joined',  onPlayerJoined)  // ← NEW
    socket.off('connect',        onReconnect)

    // Register fresh listeners
    socket.on('quiz:question',   onQuestion)
    socket.on('quiz:result',     onResult)
    socket.on('timer:tick',      onTick)
    socket.on('answer:received', onAnswerReceived)
    socket.on('quiz:ended',      onEnded)
    socket.on('player:joined',   onPlayerJoined)  // ← NEW
    socket.on('connect',         onReconnect)

    return () => {
      socket.off('quiz:question',   onQuestion)
      socket.off('quiz:result',     onResult)
      socket.off('timer:tick',      onTick)
      socket.off('answer:received', onAnswerReceived)
      socket.off('quiz:ended',      onEnded)
      socket.off('player:joined',   onPlayerJoined)
      socket.off('connect',         onReconnect)
      socket.disconnect()
    }
  }, [roomCode, setQuestion, setStatus, setCorrectIndex, setLeaderboard, setMyResult, setTimer])

  function handleAnswer(optionIndex) {
    if (myAnswer !== null) return
    if (status !== 'live') return

    setMyAnswer(optionIndex)

    socket.emit('player:answer', {
      roomCode,
      questionIndex: currentQuestion.index,
      optionIndex,
      playerId,
    })
  }

  const q = currentQuestion

  // Game Over screen
  if (status === 'ended') {
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

          <button
            className="btn btn-primary btn-lg"
            onClick={() => navigate('/join')}
          >
            <span className="mat">replay</span>Play Again
          </button>
        </div>
      </div>
    )
  }

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
            {/* Timer bar */}
            {status === 'live' && (
              <CountdownTimer remaining={timer} timeLimit={q.timeLimit} />
            )}

            {/* Question */}
            <div style={{ marginTop: 20 }}>
              <QuestionCard
                question={q}
                myAnswer={myAnswer}
                correctIndex={correctIndex}
                onAnswer={handleAnswer}
                disabled={status !== 'live'}
              />
            </div>

            {/* Waiting message after answer */}
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

            {/* Reveal feedback */}
            {status === 'revealing' && (
              <div className="fade-up" style={{ marginTop: 20 }}>
                {isCorrect !== null && (
                  <div
                    className={`feedback show ${isCorrect ? 'ok' : 'bad'}`}
                    style={{ display: 'flex' }}
                  >
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

                {/* Leaderboard */}
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
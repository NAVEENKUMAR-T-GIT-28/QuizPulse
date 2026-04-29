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

  useEffect(() => {
    // Socket should already be connected from PlayerLobby
    socket.on('quiz:question', (payload) => {
      setQuestion(payload)
      setStatus('live')
      setCorrectIndex(null)
      setAnswerConfirmed(false)
    })

    socket.on('quiz:result', ({ correctIndex: ci, leaderboard: lb }) => {
      setCorrectIndex(ci)
      setLeaderboard(lb)
      setStatus('revealing')
      // Check if player's answer was correct
      const currentAnswer = useQuizStore.getState().myAnswer
      if (currentAnswer !== null) {
        setMyResult(currentAnswer === ci, currentAnswer === ci ? 1000 : 0)
      }
    })

    socket.on('timer:tick', ({ remaining }) => {
      setTimer(remaining)
    })

    socket.on('answer:received', () => {
      setAnswerConfirmed(true)
    })

    socket.on('quiz:ended', ({ finalLeaderboard }) => {
      setLeaderboard(finalLeaderboard || [])
      setStatus('ended')
    })

    return () => {
      socket.off('quiz:question')
      socket.off('quiz:result')
      socket.off('timer:tick')
      socket.off('answer:received')
      socket.off('quiz:ended')
      socket.disconnect()
    }
  }, [])

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
                        {isCorrect ? '+1000 pts' : 'Better luck next time'}
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

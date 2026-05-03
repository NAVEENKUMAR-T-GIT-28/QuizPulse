import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getQuiz, createQuiz, updateQuiz } from '../api/quizApi'
import { clearAuth, getUser } from '../hooks/useAuth'

const LABELS = ['A', 'B', 'C', 'D']

const TIME_OPTIONS = [
  { value: 5,   label: '5 seconds' },
  { value: 10,  label: '10 seconds' },
  { value: 15,  label: '15 seconds' },
  { value: 20,  label: '20 seconds' },
  { value: 30,  label: '30 seconds' },
  { value: 45,  label: '45 seconds' },
  { value: 60,  label: '60 seconds' },
  { value: 90,  label: '90 seconds' },
  { value: 120, label: '120 seconds' },
]

const BLANK_QUESTION = () => ({ text: '', options: ['', '', '', ''], correctIndex: 0, timeLimit: 10 })

export default function QuizBuilder() {
  const navigate = useNavigate()
  const { id } = useParams()
  const user = getUser()

  const [title, setTitle]             = useState('')
  const [description, setDescription] = useState('')
  const [timerMode, setTimerMode]     = useState('per-question') // 'per-question' | 'quiz'
  const [quizTimeLimit, setQuizTimeLimit] = useState(10)
  const [questions, setQuestions]     = useState([BLANK_QUESTION()])
  const [activeQ, setActiveQ]         = useState(0)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState(null)
  const [fetchLoading, setFetchLoading] = useState(!!id)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Load existing quiz in edit mode
  useEffect(() => {
    if (!id) return
    getQuiz(id)
      .then(data => {
        const quiz = data.quiz
        setTitle(quiz.title)
        setDescription(quiz.description || '')
        setTimerMode(quiz.timerMode || 'per-question')
        setQuizTimeLimit(quiz.quizTimeLimit || 10)
        setQuestions(quiz.questions.map(q => ({
          text: q.text,
          options: [...q.options, ...Array(4 - q.options.length).fill('')].slice(0, 4),
          correctIndex: q.correctIndex,
          timeLimit: q.timeLimit || 10,
        })))
      })
      .finally(() => setFetchLoading(false))
  }, [id])

  // Question management
  function addQuestion() {
    setQuestions(prev => {
      const next = [...prev, BLANK_QUESTION()]
      setActiveQ(next.length - 1)
      return next
    })
  }

  function removeQuestion(index) {
    if (questions.length <= 1) return
    setQuestions(prev => prev.filter((_, i) => i !== index))
    setActiveQ(Math.min(activeQ, questions.length - 2))
  }

  function updateQuestion(index, field, value) {
    setQuestions(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  function updateOption(qIndex, optIndex, value) {
    setQuestions(prev => {
      const updated = [...prev]
      const options = [...updated[qIndex].options]
      options[optIndex] = value
      updated[qIndex] = { ...updated[qIndex], options }
      return updated
    })
  }

  // Submit
  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const payload = {
        title,
        description,
        timerMode,
        quizTimeLimit,
        questions: questions.map(q => ({
          ...q,
          options: q.options.filter(o => o.trim() !== '')
        }))
      }
      if (id) {
        await updateQuiz(id, payload)
      } else {
        await createQuiz(payload)
      }
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save quiz')
    } finally {
      setLoading(false)
    }
  }

  function handleLogout() {
    clearAuth()
    navigate('/')
  }

  if (fetchLoading) {
    return <div className="loading-center"><div className="spinner" /></div>
  }

  const q = questions[activeQ] || questions[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      {/* Topbar */}
      <div className="topbar">
        <button className="hamburger" onClick={() => setSidebarOpen(true)}>
          <span className="mat">menu</span>
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => navigate('/dashboard')}
          style={{ padding: '6px 10px' }}
        >
          <span className="mat sm">arrow_back</span>
          <span className="topbar-back-text">Dashboard</span>
        </button>
        <div className="topbar-sep" />
        <span style={{ fontSize: 13, color: 'var(--text2)' }}>
          <strong style={{ color: 'var(--text)' }}>{id ? 'Edit Quiz' : 'New Quiz'}</strong>
        </span>
        <div className="topbar-right">
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSubmit}
            disabled={loading}
          >
            <span className="mat sm">save</span>
            {loading ? 'Saving...' : 'Save Quiz'}
          </button>
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      <div className={`sidebar-overlay${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />

      <div className="host-layout">
        {/* Sidebar: question list */}
        <div className={`sidebar qb-sidebar${sidebarOpen ? ' open' : ''}`} style={{ width: 260, padding: '16px 10px' }}>
          {/* Mobile header */}
          <div className="sidebar-mobile-header">
            <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--indigo-l)' }}>QuizPulse</span>
            <button className="sidebar-close" onClick={() => setSidebarOpen(false)}>
              <span className="mat sm">close</span>
            </button>
          </div>

          {/* Nav links */}
          <button className="nav-item" onClick={() => { setSidebarOpen(false); navigate('/dashboard') }}>
            <span className="mat sm">arrow_back</span>Dashboard
          </button>
          <div className="nav-sep" />

          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text3)', marginBottom: 12, padding: '0 6px' }}>
            Questions ({questions.length})
          </div>

          {/* Title input */}
          <div style={{ padding: '0 6px', marginBottom: 12 }}>
            <input
              className="input"
              style={{ fontSize: 13, padding: '8px 10px' }}
              placeholder="Quiz title…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Question list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {questions.map((question, idx) => (
              <div
                key={idx}
                className={`nav-item ${idx === activeQ ? 'active' : ''}`}
                style={{
                  padding: 12, borderRadius: 'var(--r)', marginBottom: 4,
                  border: idx === activeQ ? '2px solid rgba(99,102,241,.3)' : '2px solid transparent',
                  textTransform: 'none', letterSpacing: 0,
                }}
                onClick={() => { setActiveQ(idx); setSidebarOpen(false) }}
              >
                <div style={{
                  width: 22, height: 22, borderRadius: 6,
                  background: idx === activeQ ? 'var(--indigo)' : 'rgba(255,255,255,.06)',
                  color: idx === activeQ ? '#fff' : 'var(--text2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 800, flexShrink: 0,
                }}>
                  {idx + 1}
                </div>
                <div style={{
                  fontSize: 12, fontWeight: 500, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  color: idx === activeQ ? 'var(--text)' : 'var(--text2)',
                }}>
                  {question.text || 'Untitled question'}
                </div>
              </div>
            ))}
          </div>

          <button
            className="btn btn-ghost btn-sm"
            style={{ width: '100%', marginTop: 8, borderStyle: 'dashed', color: 'var(--text3)' }}
            onClick={addQuestion}
          >
            <span className="mat sm">add</span>Add question
          </button>

          <div style={{ marginTop: 'auto', paddingTop: 12 }}>
            <button className="btn btn-danger btn-sm" style={{ width: '100%' }} onClick={handleLogout}>
              <span className="mat sm">logout</span>Sign out
            </button>
          </div>
        </div>

        {/* Editor */}
        <div className="main-content scroll-area">
          <form onSubmit={handleSubmit} style={{ maxWidth: 640 }}>
            {error && <div className="error-msg">{error}</div>}

            {/* Description + Timer Mode (shown only on first question view) */}
            {activeQ === 0 && (
              <>
                <div style={{ marginBottom: 24 }}>
                  <div className="section-label">Quiz Description (optional)</div>
                  <textarea
                    className="input textarea"
                    placeholder="Brief description of your quiz..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    style={{ fontSize: 14 }}
                  />
                </div>

                {/* ── Timer Mode Toggle ── */}
                <div style={{
                  marginBottom: 28, padding: '16px 20px',
                  background: 'rgba(99,102,241,.06)',
                  border: '1px solid rgba(99,102,241,.15)',
                  borderRadius: 'var(--r2)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <span className="mat sm" style={{ color: 'var(--indigo-l)' }}>timer</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Timer Mode</span>
                  </div>

                  {/* Toggle buttons */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    <button
                      type="button"
                      onClick={() => setTimerMode('per-question')}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: 'var(--r)',
                        border: timerMode === 'per-question'
                          ? '2px solid var(--indigo)'
                          : '2px solid var(--border2)',
                        background: timerMode === 'per-question'
                          ? 'rgba(99,102,241,.15)'
                          : 'transparent',
                        color: timerMode === 'per-question' ? 'var(--indigo-l)' : 'var(--text2)',
                        fontWeight: 700, fontSize: 13, cursor: 'pointer',
                        transition: 'all .15s',
                      }}
                    >
                      <span className="mat sm" style={{ display: 'block', marginBottom: 4 }}>tune</span>
                      Per Question
                    </button>
                    <button
                      type="button"
                      onClick={() => setTimerMode('quiz')}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: 'var(--r)',
                        border: timerMode === 'quiz'
                          ? '2px solid var(--indigo)'
                          : '2px solid var(--border2)',
                        background: timerMode === 'quiz'
                          ? 'rgba(99,102,241,.15)'
                          : 'transparent',
                        color: timerMode === 'quiz' ? 'var(--indigo-l)' : 'var(--text2)',
                        fontWeight: 700, fontSize: 13, cursor: 'pointer',
                        transition: 'all .15s',
                      }}
                    >
                      <span className="mat sm" style={{ display: 'block', marginBottom: 4 }}>av_timer</span>
                      Same for All
                    </button>
                  </div>

                  {/* Description of selected mode */}
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: timerMode === 'quiz' ? 14 : 0 }}>
                    {timerMode === 'per-question'
                      ? 'Each question has its own timer. Set it individually below.'
                      : 'One timer applies to every question in this quiz.'}
                  </div>

                  {/* Quiz-wide time limit — only shown in 'quiz' mode */}
                  {timerMode === 'quiz' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 600 }}>Time per question:</span>
                      <select
                        className="input"
                        style={{ width: 140, padding: '8px 12px', fontSize: 13 }}
                        value={quizTimeLimit}
                        onChange={(e) => setQuizTimeLimit(Number(e.target.value))}
                      >
                        {TIME_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Question text */}
            <div className="section-label">Question {activeQ + 1} text</div>
            <input
              className="input"
              style={{ fontSize: 20, fontWeight: 700, padding: 16, marginBottom: 24, letterSpacing: '-.3px' }}
              placeholder="Enter your question…"
              value={q.text}
              onChange={(e) => updateQuestion(activeQ, 'text', e.target.value)}
            />

            {/* Options */}
            <div className="section-label" style={{ marginBottom: 12 }}>
              Answer options <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--text3)', fontSize: 11 }}>— click to mark correct</span>
            </div>
            {q.options.map((opt, optIdx) => (
              <div
                key={optIdx}
                className={`opt-row ${q.correctIndex === optIdx ? 'correct' : ''}`}
                onClick={() => updateQuestion(activeQ, 'correctIndex', optIdx)}
              >
                <div className="opt-letter">{LABELS[optIdx]}</div>
                <input
                  className="opt-input"
                  placeholder={`Option ${LABELS[optIdx]}…`}
                  value={opt}
                  onChange={(e) => updateOption(activeQ, optIdx, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
                <span
                  className={`mat sm ${q.correctIndex === optIdx ? 'fill' : ''}`}
                  style={{ color: q.correctIndex === optIdx ? 'var(--green)' : 'var(--text3)' }}
                >
                  {q.correctIndex === optIdx ? 'check_circle' : 'radio_button_unchecked'}
                </span>
              </div>
            ))}

            {/* Footer: per-question time limit (hidden in quiz-wide mode) + delete */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)',
              flexWrap: 'wrap', gap: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {timerMode === 'per-question' ? (
                  <>
                    <span className="mat sm" style={{ color: 'var(--text3)' }}>timer</span>
                    <span style={{ fontSize: 13, color: 'var(--text2)' }}>Time limit:</span>
                    <select
                      className="input"
                      style={{ width: 130, padding: '8px 12px', fontSize: 13 }}
                      value={q.timeLimit}
                      onChange={(e) => updateQuestion(activeQ, 'timeLimit', Number(e.target.value))}
                    >
                      {TIME_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </>
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="mat sm">av_timer</span>
                    Using quiz timer: <strong style={{ color: 'var(--indigo-l)', marginLeft: 4 }}>{quizTimeLimit}s</strong>
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => removeQuestion(activeQ)}
                  disabled={questions.length <= 1}
                >
                  <span className="mat sm">delete</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
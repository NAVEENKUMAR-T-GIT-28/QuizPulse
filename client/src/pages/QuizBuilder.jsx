import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getQuiz, createQuiz, updateQuiz } from '../api/quizApi'

const LABELS = ['A', 'B', 'C', 'D']

export default function QuizBuilder() {
  const navigate = useNavigate()
  const { id } = useParams()

  const [title, setTitle]             = useState('')
  const [description, setDescription] = useState('')
  const [questions, setQuestions]     = useState([
    { text: '', options: ['', '', '', ''], correctIndex: 0, timeLimit: 30 }
  ])
  const [activeQ, setActiveQ]         = useState(0)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState(null)
  const [fetchLoading, setFetchLoading] = useState(!!id)

  // Load existing quiz in edit mode
  useEffect(() => {
    if (!id) return
    getQuiz(id)
      .then(data => {
        setTitle(data.quiz.title)
        setDescription(data.quiz.description || '')
        setQuestions(data.quiz.questions.map(q => ({
          text: q.text,
          options: [...q.options, ...Array(4 - q.options.length).fill('')].slice(0, 4),
          correctIndex: q.correctIndex,
          timeLimit: q.timeLimit || 30,
        })))
      })
      .finally(() => setFetchLoading(false))
  }, [id])

  // Question management
  function addQuestion() {
    setQuestions(prev => {
      const next = [...prev, { text: '', options: ['', '', '', ''], correctIndex: 0, timeLimit: 30 }]
      // Use a timeout so the state update for setQuestions runs first,
      // then setActiveQ is called with the correct new index.
      // (Both setState calls are batched in React 18, so we read from `next` directly.)
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

  if (fetchLoading) {
    return <div className="loading-center"><div className="spinner" /></div>
  }

  const q = questions[activeQ] || questions[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      {/* Topbar */}
      <div className="topbar">
        <div className="topbar-logo">QuizPulse</div>
        <div className="topbar-sep" />
        <span style={{ fontSize: 13, color: 'var(--text2)' }}>
          Dashboard / <strong style={{ color: 'var(--text)' }}>{id ? 'Edit Quiz' : 'New Quiz'}</strong>
        </span>
        <div className="topbar-right">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard')}>
            <span className="mat sm">arrow_back</span>Back
          </button>
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

      <div className="host-layout">
        {/* Sidebar: question list */}
        <div className="sidebar" style={{ width: 260, padding: '16px 10px' }}>
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
                onClick={() => setActiveQ(idx)}
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
        </div>

        {/* Editor */}
        <div className="main-content scroll-area">
          <form onSubmit={handleSubmit} style={{ maxWidth: 640 }}>
            {error && <div className="error-msg">{error}</div>}

            {/* Description (shown at top for first time) */}
            {activeQ === 0 && (
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

            {/* Footer: time limit + actions */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="mat sm" style={{ color: 'var(--text3)' }}>timer</span>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>Time limit:</span>
                <select
                  className="input"
                  style={{ width: 130, padding: '8px 12px', fontSize: 13 }}
                  value={q.timeLimit}
                  onChange={(e) => updateQuestion(activeQ, 'timeLimit', Number(e.target.value))}
                >
                  <option value={10}>10 seconds</option>
                  <option value={15}>15 seconds</option>
                  <option value={20}>20 seconds</option>
                  <option value={30}>30 seconds</option>
                  <option value={45}>45 seconds</option>
                  <option value={60}>60 seconds</option>
                  <option value={90}>90 seconds</option>
                  <option value={120}>120 seconds</option>
                </select>
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

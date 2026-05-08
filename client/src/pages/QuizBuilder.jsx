import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getQuiz, createQuiz, updateQuiz } from '../api/quizApi'
import Sidebar from '../components/Sidebar'
import Topbar from '../components/Topbar'

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

  const [title, setTitle]             = useState('')
  const [description, setDescription] = useState('')
  const [timerMode, setTimerMode]     = useState('per-question') // 'per-question' | 'quiz'
  const [quizTimeLimit, setQuizTimeLimit] = useState(10)
  const [questions, setQuestions]     = useState([BLANK_QUESTION()])
  const [activeQ, setActiveQ]         = useState(-1)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState(null)
  const [fetchLoading, setFetchLoading] = useState(!!id)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isMobile, setIsMobile]       = useState(window.innerWidth <= 768)
  const [viewMode, setViewMode] = useState(isMobile ? 'accordion' : 'desktop') // 'accordion' | 'desktop'

  // Listen for resize
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Lock mobile to accordion view and hide desktop toggle
  useEffect(() => {
    if (isMobile) setViewMode('accordion')
  }, [isMobile])

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
    if (questions.length >= 25) return
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

  if (fetchLoading) {
    return <div className="loading-center"><div className="spinner" /></div>
  }

  function renderQuizSettings() {
    return (
      <div style={{ padding: 0, background: 'transparent', border: 'none', marginBottom: 12 }}>
        <div style={{ marginBottom: 20 }}>
          <div className="section-label">Quiz Title</div>
          <input
            className="input"
            style={{ fontSize: isMobile ? 18 : 16, fontWeight: 700, padding: '12px 16px' }}
            placeholder="Enter quiz title..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <div className="section-label">Quiz Description</div>
          <textarea
            className="input textarea"
            placeholder="Brief description..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ fontSize: 13, minHeight: 80 }}
          />
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span className="mat sm" style={{ color: 'var(--indigo-l)' }}>timer</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Timer Mode</span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => setTimerMode('per-question')}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 'var(--r)',
                border: timerMode === 'per-question' ? '2px solid var(--indigo)' : '1px solid var(--border)',
                background: timerMode === 'per-question' ? 'rgba(99,102,241,.1)' : 'transparent',
                color: timerMode === 'per-question' ? 'var(--indigo-l)' : 'var(--text2)',
                fontWeight: 700, fontSize: 12, cursor: 'pointer',
              }}
            >
              Per Question
            </button>
            <button
              type="button"
              onClick={() => setTimerMode('quiz')}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 'var(--r)',
                border: timerMode === 'quiz' ? '2px solid var(--indigo)' : '1px solid var(--border)',
                background: timerMode === 'quiz' ? 'rgba(99,102,241,.1)' : 'transparent',
                color: timerMode === 'quiz' ? 'var(--indigo-l)' : 'var(--text2)',
                fontWeight: 700, fontSize: 12, cursor: 'pointer',
              }}
            >
              Same for All
            </button>
          </div>
          {timerMode === 'quiz' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>Time:</span>
              <select
                className="input"
                style={{ width: '100%', padding: '6px 10px', fontSize: 12 }}
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
      </div>
    )
  }

  function renderQuestionEditor(question, idx) {
    return (
      <div key={idx}>
        {/* Question text */}
        <div className="section-label">Question {idx + 1} text</div>
        <input
          className="input"
          style={{ fontSize: 20, fontWeight: 700, padding: 16, marginBottom: 24, letterSpacing: '-.3px' }}
          placeholder="Enter your question…"
          value={question.text}
          onChange={(e) => updateQuestion(idx, 'text', e.target.value)}
        />

        {/* Options */}
        <div className="section-label" style={{ marginBottom: 12 }}>
          Answer options <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--text3)', fontSize: 11 }}>— click to mark correct</span>
        </div>
        {question.options.map((opt, optIdx) => (
          <div
            key={optIdx}
            className={`opt-row ${question.correctIndex === optIdx ? 'correct' : ''}`}
            onClick={() => updateQuestion(idx, 'correctIndex', optIdx)}
          >
            <div className="opt-letter">{LABELS[optIdx]}</div>
            <input
              className="opt-input"
              placeholder={`Option ${LABELS[optIdx]}…`}
              value={opt}
              onChange={(e) => updateOption(idx, optIdx, e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
            <span
              className={`mat sm ${question.correctIndex === optIdx ? 'fill' : ''}`}
              style={{ color: question.correctIndex === optIdx ? 'var(--green)' : 'var(--text3)' }}
            >
              {question.correctIndex === optIdx ? 'check_circle' : 'radio_button_unchecked'}
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
                  value={question.timeLimit}
                  onChange={(e) => updateQuestion(idx, 'timeLimit', Number(e.target.value))}
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
              onClick={() => removeQuestion(idx)}
              disabled={questions.length <= 1}
            >
              <span className="mat sm">delete</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Topbar */}
      <Topbar 
        onMenuClick={() => setSidebarOpen(true)} 
        onLogoClick={() => navigate('/dashboard')}
        title={id ? 'Edit Quiz' : 'New Quiz'}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!isMobile && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className={`btn ${viewMode === 'desktop' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
                onClick={() => setViewMode('desktop')}
              >
                Desktop
              </button>
              <button
                type="button"
                className={`btn ${viewMode === 'accordion' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
                onClick={() => setViewMode('accordion')}
              >
                Accordion
              </button>
            </div>
          )}

          <button
            className="btn btn-primary btn-sm"
            onClick={handleSubmit}
            disabled={loading}
          >
            <span className="mat sm">save</span>
            {loading ? 'Saving...' : 'Save Quiz'}
          </button>
        </div>
      </Topbar>

      <div className="host-layout">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} activePage="new" />

        {/* Main Content (Editor) */}
        <div className="main-content scroll-area">
          <div style={{ maxWidth: 800, margin: '0 auto', paddingBottom: 60 }}>
            {error && <div className="error-msg">{error}</div>}

            {/* Layout Branch: Accordion vs Desktop Single Question */}
            {viewMode === 'accordion' ? (
              <div className="mobile-accordion-list">
                {/* Quiz Settings Accordion Item (Mobile/Desktop unified) */}
                <div className="accordion" style={{ marginBottom: 12 }}>
                  <div 
                    className={`accordion-header ${activeQ === -1 ? 'active' : ''}`}
                    onClick={() => setActiveQ(activeQ === -1 ? -2 : -1)}
                    style={{ background: 'rgba(99,102,241,.05)', borderColor: activeQ === -1 ? 'var(--indigo)' : 'var(--border)' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span className="mat" style={{ color: 'var(--indigo-l)' }}>settings</span>
                      <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--indigo-l)' }}>
                        Quiz Settings
                      </span>
                    </div>
                    <span className="mat">{activeQ === -1 ? 'expand_less' : 'expand_more'}</span>
                  </div>
                  {activeQ === -1 && (
                    <div className="accordion-content" style={{ padding: '20px 16px' }}>
                      {renderQuizSettings()}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div className="section-label" style={{ marginBottom: 0 }}>Questions</div>
                  {activeQ !== -2 && (
                    <button 
                      type="button" 
                      className="btn btn-ghost btn-sm" 
                      style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}
                      onClick={() => setActiveQ(-2)}
                    >
                      <span className="mat sm" style={{ fontSize: 14 }}>unfold_less</span>
                      Collapse All
                    </button>
                  )}
                </div>

                {questions.map((question, idx) => (
                  <div key={idx} className="accordion">
                    <div 
                      className={`accordion-header ${activeQ === idx ? 'active' : ''}`}
                      onClick={() => setActiveQ(activeQ === idx ? -2 : idx)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 24, height: 24, borderRadius: 6, background: activeQ === idx ? 'var(--indigo)' : 'var(--bg4)', color: activeQ === idx ? '#fff' : 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>
                          {idx + 1}
                        </div>
                        <span style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '60vw' }}>
                          {question.text || 'Untitled question'}
                        </span>
                      </div>
                      <span className="mat">{activeQ === idx ? 'expand_less' : 'expand_more'}</span>
                    </div>
                    {activeQ === idx && (
                      <div className="accordion-content">
                        {renderQuestionEditor(question, idx)}
                      </div>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn-ghost btn-lg"
                  style={{ width: '100%', borderStyle: 'dashed', marginTop: 12 }}
                  onClick={addQuestion}
                  disabled={questions.length >= 25}
                >
                  <span className="mat sm">add</span>
                  {questions.length >= 25 ? 'Max 25 questions reached' : 'Add another question'}
                </button>
              </div>
            ) : (
              <>
                {/* Desktop Single Question Editor */}
                <div className="accordion" style={{ marginBottom: 28 }}>
                  <div 
                    className={`accordion-header ${activeQ === -1 ? 'active' : ''}`}
                    onClick={() => setActiveQ(activeQ === -1 ? -2 : -1)}
                    style={{ 
                      padding: '16px 20px', 
                      background: activeQ === -1 ? 'rgba(99,102,241,.06)' : 'var(--bg2)',
                      border: '1px solid var(--border)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span className="mat" style={{ color: activeQ === -1 ? 'var(--indigo-l)' : 'var(--text3)' }}>settings</span>
                      <span style={{ fontWeight: 800, fontSize: 15, color: activeQ === -1 ? 'var(--indigo-l)' : 'var(--text2)' }}>
                        Quiz Settings
                      </span>
                    </div>
                    <span className="mat">{activeQ === -1 ? 'expand_less' : 'expand_more'}</span>
                  </div>
                  {activeQ === -1 && (
                    <div className="accordion-content" style={{ padding: '32px', background: 'var(--bg)', border: '1px solid var(--border)', borderTop: 'none' }}>
                      {renderQuizSettings()}
                    </div>
                  )}
                </div>

                <div className="glass" style={{ padding: 32, borderRadius: 'var(--r2)' }}>
                  {renderQuestionEditor(questions[activeQ] || questions[0], activeQ < 0 ? 0 : activeQ)}
                </div>
              </>
            )}
          </div>
        </div>

        {viewMode === 'desktop' && (
          <div className="sidebar" style={{ width: 300, borderLeft: '1px solid var(--border)', borderRight: 'none', background: 'var(--bg2)', padding: '20px 16px' }}>
            <div style={{ padding: '4px 6px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="section-label" style={{ marginBottom: 0 }}>Questions ({questions.length})</div>
                {questions.length >= 25 && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(239,68,68,.12)', color: '#f87171' }}>MAX</span>
                )}
                {questions.length >= 20 && questions.length < 25 && (
                  <span style={{ fontSize: 10, color: 'var(--text3)' }}>{25 - questions.length} left</span>
                )}
              </div>
              <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }} onClick={addQuestion} disabled={questions.length >= 25}>
                <span className="mat sm">add</span>
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
              {questions.map((question, idx) => (
                <div
                  key={idx}
                  className={`lb-row ${idx === activeQ ? 'me' : ''}`}
                  style={{ cursor: 'pointer', padding: '12px 14px', marginBottom: 8, borderColor: idx === activeQ ? 'var(--indigo)' : 'var(--border)' }}
                  onClick={() => setActiveQ(idx)}
                >
                  <div className="lb-rank" style={{ color: idx === activeQ ? 'var(--indigo)' : 'var(--text3)' }}>{idx + 1}</div>
                  <div className="lb-name" style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {question.text || 'Untitled question'}
                  </div>
                  {questions.length > 1 && (
                    <button 
                      type="button"
                      className="btn btn-ghost btn-sm" 
                      style={{ padding: 4, minWidth: 0, border: 'none' }}
                      onClick={(e) => { e.stopPropagation(); removeQuestion(idx) }}
                    >
                      <span className="mat sm" style={{ fontSize: 16 }}>delete</span>
                    </button>
                  )}
                </div>
              ))}
            </div>

              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%', marginTop: 16 }}
                onClick={addQuestion}
                disabled={questions.length >= 25}
                title={questions.length >= 25 ? 'Maximum 25 questions reached' : undefined}
              >
                <span className="mat sm">add</span>
                {questions.length >= 25 ? 'Max 25 questions reached' : 'Add new question'}
              </button>
          </div>
        )}
      </div>
    </div>
  )
}
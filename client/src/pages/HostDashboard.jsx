import ThemeToggle from '../components/ThemeToggle'
import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getQuizzes, deleteQuiz, createSession, logout } from '../api/quizApi'
import { clearAuth, getUser } from '../hooks/useAuth'

export default function HostDashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const [quizzes, setQuizzes]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [fetchError, setFetchError] = useState(null)
  const [launching, setLaunching] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // Error message passed via navigation state (e.g. from unauthorized host redirect)
  const [redirectError, setRedirectError] = useState(location.state?.error || null)
  const user = getUser()

  useEffect(() => {
    getQuizzes()
      .then(data => setQuizzes(data.quizzes || []))
      .catch(err => {
        if (err.response?.status === 401) {
          // JWT expired — send user back to auth
          navigate('/auth')
        } else {
          setFetchError(err.response?.data?.error || 'Failed to load quizzes')
        }
      })
      .finally(() => setLoading(false))
  }, [])

  function handleCreate() {
    setSidebarOpen(false)
    navigate('/quiz/new')
  }

  function handleEdit(id) {
    navigate(`/quiz/${id}/edit`)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this quiz?')) return
    await deleteQuiz(id)
    setQuizzes(prev => prev.filter(q => q._id !== id))
  }

  async function handleLaunch(quizId) {
    setLaunching(quizId)
    try {
      const data = await createSession(quizId)
      navigate(`/lobby/${data.roomCode}`)
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to launch session')
      setLaunching(null)
    }
  }

  async function handleLogout() {
    try {
      await logout()      // tells server to clear the httpOnly cookie
    } catch {
      // ignore network errors — clear local state regardless
    }
    clearAuth()           // clears the user object from localStorage
    navigate('/')
  }

  const tagColors = [
    { bg: 'rgba(99,102,241,.12)', color: 'var(--indigo-l)', border: 'rgba(99,102,241,.2)' },
    { bg: 'rgba(34,197,94,.1)', color: 'var(--green-l)', border: 'rgba(34,197,94,.2)' },
    { bg: 'rgba(245,158,11,.1)', color: '#fbbf24', border: 'rgba(245,158,11,.2)' },
    { bg: 'rgba(239,68,68,.1)', color: '#f87171', border: 'rgba(239,68,68,.2)' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      {/* Topbar */}
      <div className="topbar">
        <button className="hamburger" onClick={() => setSidebarOpen(true)}>
          <span className="mat">menu</span>
        </button>
        <div className="topbar-logo">QuizPulse</div>
        <div className="topbar-sep" />
        <span style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 600 }}>Host Console</span>
        <div className="topbar-right">
          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(99,102,241,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="mat sm" style={{ color: 'var(--indigo-l)' }}>person</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{user.name}</span>
            </div>
          )}
          <ThemeToggle />
          <button className="btn btn-danger btn-sm" onClick={handleLogout}>
            <span className="mat sm">logout</span>Sign out
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
          <button className="nav-item active">
            <span className="mat sm">dashboard</span>Dashboard
          </button>
          <button className="nav-item" onClick={handleCreate}>
            <span className="mat sm">add_circle</span>New Quiz
          </button>
          <button className="nav-item" onClick={() => { setSidebarOpen(false); navigate('/history') }}>
            <span className="mat sm">history</span>History
          </button>
          <div style={{ marginTop: 'auto', paddingTop: 12 }}>
            <button className="btn btn-danger btn-sm" style={{ width: '100%' }} onClick={handleLogout}>
              <span className="mat sm">logout</span>Sign out
            </button>
          </div>
        </div>

        {/* Main */}
        <div className="main-content scroll-area">
          <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div className="page-title">Dashboard</div>
              <div className="page-sub">Manage and launch your quiz sessions</div>
            </div>
            <button className="btn btn-primary" onClick={handleCreate}>
              <span className="mat sm">add</span>New quiz
            </button>
          </div>

          {/* Redirect error banner (e.g. unauthorized lobby access) */}
          {redirectError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 'var(--r)', padding: '12px 16px', marginBottom: 20 }}>
              <span className="mat sm" style={{ color: '#f87171' }}>lock</span>
              <span style={{ fontSize: 14, color: '#f87171', flex: 1 }}>{redirectError}</span>
              <button onClick={() => setRedirectError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: 0 }}>
                <span className="mat sm">close</span>
              </button>
            </div>
          )}

          {/* Stats */}
          <div className="grid-4" style={{ marginBottom: 32 }}>
            <div className="stat-card">
              <div className="stat-label">Total Quizzes</div>
              <div className="stat-val" style={{ color: 'var(--indigo-l)' }}>{quizzes.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total Questions</div>
              <div className="stat-val">{quizzes.reduce((s, q) => s + (q.questions?.length || 0), 0)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Ready to Launch</div>
              <div className="stat-val" style={{ color: 'var(--green-l)' }}>{quizzes.filter(q => q.questions?.length > 0).length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Status</div>
              <div className="stat-val" style={{ fontSize: 18, color: 'var(--green-l)' }}>● Active</div>
            </div>
          </div>

          {/* Quiz list header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div className="section-label" style={{ marginBottom: 0 }}>My Quizzes</div>
          </div>

          {loading ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : fetchError ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text3)' }}>
              <span className="mat xl" style={{ fontSize: 48, marginBottom: 16, display: 'block', opacity: 0.3 }}>error_outline</span>
              <p style={{ fontSize: 16, marginBottom: 8 }}>Could not load quizzes</p>
              <p style={{ fontSize: 13, color: 'var(--red, #f87171)', marginBottom: 20 }}>{fetchError}</p>
              <button className="btn btn-ghost" onClick={() => window.location.reload()}>Retry</button>
            </div>
          ) : quizzes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text3)' }}>
              <span className="mat xl" style={{ fontSize: 48, marginBottom: 16, display: 'block', opacity: 0.3 }}>quiz</span>
              <p style={{ fontSize: 16, marginBottom: 20 }}>No quizzes yet</p>
              <button className="btn btn-primary" onClick={handleCreate}>
                <span className="mat sm">add</span>Create your first quiz
              </button>
            </div>
          ) : (
            <div className="grid-2" style={{ gap: 16 }}>
              {quizzes.map((quiz, idx) => {
                const colors = tagColors[idx % tagColors.length]
                return (
                  <div key={quiz._id} className="quiz-card">
                    <div className="quiz-card-body">
                      <div
                        className="quiz-card-tag"
                        style={{ background: colors.bg, color: colors.color, border: `1px solid ${colors.border}` }}
                      >
                        {quiz.questions?.length || 0} Questions
                      </div>
                      <div className="quiz-card-title">{quiz.title}</div>
                      <div className="quiz-card-meta">
                        <span><span className="mat sm">calendar_today</span> {new Date(quiz.createdAt).toLocaleDateString()}</span>
                        {quiz.description && <span style={{ opacity: 0.6 }}>{quiz.description.slice(0, 40)}</span>}
                      </div>
                    </div>
                    <div className="quiz-card-footer">
                      <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                        <span className="mat sm">help_outline</span> {quiz.questions?.length || 0} questions
                      </div>
                      <div style={{ display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleEdit(quiz._id)}>
                          <span className="mat sm">edit</span>
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(quiz._id)}>
                          <span className="mat sm">delete</span>
                        </button>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleLaunch(quiz._id)}
                          disabled={launching === quiz._id}
                        >
                          {launching === quiz._id ? '...' : 'Launch →'}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Add quiz card */}
              <button
                className="quiz-card"
                style={{
                  borderStyle: 'dashed', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 10,
                  minHeight: 120, cursor: 'pointer', background: 'transparent', color: 'var(--text3)',
                  fontFamily: 'inherit',
                }}
                onClick={handleCreate}
              >
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="mat">add</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>New Quiz</div>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
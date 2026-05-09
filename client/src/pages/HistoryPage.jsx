import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSessionHistory, getSessionResults, exportSessionPdf, deleteSession } from '../api/quizApi'
import Sidebar from '../components/Sidebar'
import Topbar from '../components/Topbar'

export default function HistoryPage() {
  const navigate = useNavigate()

  const [sessions, setSessions]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [fetchError, setFetchError]   = useState(null)
  const [page, setPage]               = useState(1)
  const [totalPages, setTotalPages]   = useState(1)
  const [totalSessions, setTotalSessions] = useState(0)
  const [selected, setSelected]       = useState(null)   // sessionId being viewed
  const [results, setResults]         = useState(null)
  const [resultsLoading, setResultsLoading] = useState(false)
  const [activeTab, setActiveTab]     = useState('leaderboard') // 'leaderboard' | 'questions'
  const [search, setSearch]           = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [deleteTarget, setDeleteTarget] = useState(null)  // { sessionId, quizTitle }
  const [deleting, setDeleting]         = useState(false)
  const [exportingId, setExportingId]   = useState(null)
  const [sidebarOpen, setSidebarOpen]   = useState(false)

  useEffect(() => {
    getSessionHistory(1)
      .then(data => {
        setSessions(data.sessions || [])
        setPage(data.page || 1)
        setTotalPages(data.totalPages || 1)
        setTotalSessions(data.totalSessions || 0)
      })
      .catch(err => {
        if (err.response?.status === 401) navigate('/auth')
        else setFetchError(err.response?.data?.error || 'Failed to load history')
      })
      .finally(() => setLoading(false))
  }, [])

  async function loadMore() {
    const nextPage = page + 1
    setLoadingMore(true)
    try {
      const data = await getSessionHistory(nextPage)
      setSessions(prev => [...prev, ...(data.sessions || [])])
      setPage(data.page || nextPage)
      setTotalPages(data.totalPages || 1)
      setTotalSessions(data.totalSessions || 0)
    } catch (err) {
      console.error('Failed to load more sessions:', err)
    } finally {
      setLoadingMore(false)
    }
  }

  async function handleViewSession(sessionId) {
    if (selected === sessionId) { setSelected(null); setResults(null); return }
    setSelected(sessionId)
    setResults(null)
    setResultsLoading(true)
    setActiveTab('leaderboard')
    try {
      const data = await getSessionResults(sessionId)
      setResults(data)
    } catch (err) {
      setResults({ error: err.response?.data?.error || 'Failed to load results' })
    } finally {
      setResultsLoading(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteSession(deleteTarget.sessionId)
      setSessions(prev => prev.filter(s => s.sessionId !== deleteTarget.sessionId))
      setTotalSessions(prev => Math.max(0, prev - 1))
      if (selected === deleteTarget.sessionId) { setSelected(null); setResults(null) }
      setDeleteTarget(null)
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete session')
    } finally {
      setDeleting(false)
    }
  }

  async function handleExport(sessionId, quizTitle, e) {
    e.stopPropagation()
    setExportingId(sessionId)
    try {
      const filename = `quizpulse-${quizTitle.replace(/\s+/g, '-').toLowerCase()}-${sessionId.slice(-6)}.pdf`
      await exportSessionPdf(sessionId, filename)
    } catch (err) {
      alert(err.message || 'Failed to export PDF')
    } finally {
      setExportingId(null)
    }
  }

  function fmtDate(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function fmtTime(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }

  function fmtDuration(start, end) {
    if (!start || !end) return '—'
    const ms = new Date(end) - new Date(start)
    const m = Math.floor(ms / 60000)
    const s = Math.floor((ms % 60000) / 1000)
    if (m === 0) return `${s}s`
    return `${m}m ${s}s`
  }

  const statusColors = {
    ended:    { bg: 'rgba(34,197,94,.1)',   color: 'var(--green-l)',  border: 'rgba(34,197,94,.2)',    label: 'Ended'    },
    live:     { bg: 'rgba(239,68,68,.12)',  color: '#f87171',         border: 'rgba(239,68,68,.25)',   label: 'Live'     },
    waiting:  { bg: 'rgba(245,158,11,.1)',  color: '#fbbf24',         border: 'rgba(245,158,11,.2)',   label: 'Waiting'  },
    revealing:{ bg: 'rgba(99,102,241,.12)', color: 'var(--indigo-l)', border: 'rgba(99,102,241,.25)', label: 'Revealing'},
  }

  const filtered = sessions.filter(s => {
    const matchSearch = s.quizTitle.toLowerCase().includes(search.toLowerCase()) ||
                        s.roomCode.toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus === 'all' || s.status === filterStatus
    return matchSearch && matchStatus
  })

  const endedCount   = sessions.filter(s => s.status === 'ended').length
  const totalPlayers = sessions.reduce((acc, s) => acc + s.playerCount, 0)
  const hasMore      = page < totalPages

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Topbar */}
      <Topbar onMenuClick={() => setSidebarOpen(true)} title="Host History" />

      <div className="host-layout">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} activePage="history" />

        {/* Main */}
        <div className="main-content scroll-area">
          <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div className="page-title">Session History</div>
              <div className="page-sub">Review results from all your past quiz sessions</div>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
              borderRadius: 8, background: 'var(--amber-bg)', border: '1px solid var(--amber-border)',
              fontSize: 12, color: 'var(--amber)', flexShrink: 0,
              fontWeight: 600
            }}>
              <span className="mat sm" style={{ fontSize: 16 }}>schedule</span>
              Session data is automatically deleted after 90 days
            </div>
          </div>

          {/* Stats */}
          <div className="grid-4" style={{ marginBottom: 32 }}>
            <div className="stat-card">
              <div className="stat-label">Total Sessions</div>
              <div className="stat-val" style={{ color: 'var(--indigo-l)' }}>{totalSessions}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Completed</div>
              <div className="stat-val" style={{ color: 'var(--green-l)' }}>{endedCount}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total Players</div>
              <div className="stat-val">{totalPlayers}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Avg Players</div>
              <div className="stat-val">
                {totalSessions > 0 ? Math.round(totalPlayers / sessions.length) : 0}
              </div>
            </div>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <span className="mat sm" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none' }}>search</span>
              <input
                className="input"
                style={{ paddingLeft: 36 }}
                placeholder="Search by quiz title or room code…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select
              className="input"
              style={{ width: 160 }}
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="ended">Ended</option>
              <option value="live">Live</option>
              <option value="waiting">Waiting</option>
            </select>
          </div>

          {/* Content */}
          {loading ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : fetchError ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text3)' }}>
              <span className="mat xl" style={{ fontSize: 48, marginBottom: 16, display: 'block', opacity: 0.3 }}>error_outline</span>
              <p style={{ fontSize: 16, marginBottom: 8 }}>Could not load history</p>
              <p style={{ fontSize: 13, color: '#f87171', marginBottom: 20 }}>{fetchError}</p>
              <button className="btn btn-ghost" onClick={() => window.location.reload()}>Retry</button>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text3)' }}>
              <span className="mat xl" style={{ fontSize: 48, marginBottom: 16, display: 'block', opacity: 0.3 }}>
                {sessions.length === 0 ? 'history' : 'search_off'}
              </span>
              <p style={{ fontSize: 16 }}>
                {sessions.length === 0 ? 'No sessions yet' : 'No sessions match your search'}
              </p>
              {sessions.length === 0 && (
                <p style={{ fontSize: 13, marginTop: 8 }}>Launch a quiz from the Dashboard to get started.</p>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.map(session => {
                const sc = statusColors[session.status] || statusColors.ended
                const isExpanded = selected === session.sessionId
                return (
                  <div key={session.sessionId}>
                    {/* Session Row */}
                    <div
                      className="glass"
                      style={{
                        borderRadius: 'var(--r2)',
                        padding: '16px 20px',
                        cursor: 'pointer',
                        transition: 'border-color .15s, background .15s',
                        borderColor: isExpanded ? 'rgba(99,102,241,.35)' : undefined,
                        background: isExpanded ? 'rgba(99,102,241,.04)' : undefined,
                      }}
                      onClick={() => handleViewSession(session.sessionId)}
                    >
                      <div className="session-row-inner" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                        {/* Icon */}
                        <div style={{
                          width: 40, height: 40, borderRadius: 10,
                          background: 'rgba(99,102,241,.1)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                        }}>
                          <span className="mat" style={{ color: 'var(--indigo-l)' }}>quiz</span>
                        </div>

                        {/* Title & meta */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {session.quizTitle}
                          </div>
                          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 12, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span className="mat sm">tag</span>
                              <span className="mono" style={{ letterSpacing: 1 }}>{session.roomCode}</span>
                            </span>
                            <span style={{ fontSize: 12, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span className="mat sm">calendar_today</span>{fmtDate(session.createdAt)}
                            </span>
                            {session.startedAt && (
                              <span style={{ fontSize: 12, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span className="mat sm">schedule</span>{fmtTime(session.startedAt)}
                              </span>
                            )}
                            {session.startedAt && session.endedAt && (
                              <span style={{ fontSize: 12, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span className="mat sm">timer</span>{fmtDuration(session.startedAt, session.endedAt)}
                              </span>
                            )}
                            <span style={{ fontSize: 12, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span className="mat sm">people</span>{session.playerCount} players
                            </span>
                          </div>
                        </div>

                        {/* Player count — hidden on mobile via CSS */}
                        <div className="session-player-count" style={{ textAlign: 'center', minWidth: 60 }}>
                          <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text)' }}>{session.playerCount}</div>
                          <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600 }}>PLAYERS</div>
                        </div>

                        {/* Actions row */}
                        <div className="session-actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {/* Status badge */}
                          <span style={{
                            padding: '4px 12px', borderRadius: 100, fontSize: 11, fontWeight: 700,
                            letterSpacing: .5, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`
                          }}>
                            {sc.label}
                          </span>

                          {/* Chevron */}
                          <span className="mat sm" style={{ color: 'var(--text3)', transition: 'transform .2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                            expand_more
                          </span>

                          {/* Delete button */}
                        <button
                          className="btn btn-danger btn-sm"
                          style={{ flexShrink: 0 }}
                          onClick={e => { e.stopPropagation(); setDeleteTarget({ sessionId: session.sessionId, quizTitle: session.quizTitle }) }}
                          title="Delete session"
                        >
                          <span className="mat sm">delete</span>
                        </button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Results Panel */}
                    {isExpanded && (
                      <div className="glass" style={{
                        borderRadius: '0 0 var(--r2) var(--r2)',
                        borderTop: 'none',
                        padding: '0 20px 20px',
                        marginTop: -2,
                      }}>
                        {resultsLoading ? (
                          <div style={{ padding: '32px 0', textAlign: 'center' }}>
                            <div className="spinner" style={{ margin: '0 auto' }} />
                          </div>
                        ) : results?.error ? (
                          <div style={{ padding: '24px 0', textAlign: 'center', color: '#f87171', fontSize: 14 }}>
                            <span className="mat sm">error_outline</span> {results.error}
                          </div>
                        ) : results ? (
                          <>
                            {/* Summary strip */}
                            <div style={{ display: 'flex', gap: 20, padding: '16px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                              {[
                                { icon: 'people', label: 'Players', val: results.session.totalPlayers },
                                { icon: 'help_outline', label: 'Questions', val: results.questionStats.length },
                                { icon: 'emoji_events', label: 'Top Score', val: results.leaderboard[0]?.score ?? '—' },
                                {
                                  icon: 'percent',
                                  label: 'Avg Correct',
                                  val: results.questionStats.length > 0
                                    ? Math.round(results.questionStats.reduce((a, q) => a + q.correctRate, 0) / results.questionStats.length) + '%'
                                    : '—'
                                },
                              ].map(item => (
                                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span className="mat sm" style={{ color: 'var(--indigo-l)' }}>{item.icon}</span>
                                  <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600 }}>{item.label}:</span>
                                  <span style={{ fontSize: 14, fontWeight: 800 }}>{item.val}</span>
                                </div>
                              ))}

                              {/* Export button */}
                              <div style={{ marginLeft: 'auto' }}>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  onClick={e => handleExport(session.sessionId, results.session.quizTitle, e)}
                                  disabled={exportingId === session.sessionId}
                                >
                                  {exportingId === session.sessionId
                                    ? <><div className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} />Exporting…</>
                                    : <><span className="mat sm">download</span>Export PDF</>
                                  }
                                </button>
                              </div>
                            </div>

                            {/* Tabs */}
                            <div style={{ display: 'flex', gap: 4, margin: '16px 0 12px', borderBottom: '1px solid var(--border)' }}>
                              {['leaderboard', 'questions'].map(tab => (
                                <button
                                  key={tab}
                                  onClick={e => { e.stopPropagation(); setActiveTab(tab) }}
                                  style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    padding: '8px 16px', fontFamily: 'inherit',
                                    fontSize: 13, fontWeight: 700, letterSpacing: .3,
                                    color: activeTab === tab ? 'var(--indigo-l)' : 'var(--text3)',
                                    borderBottom: activeTab === tab ? '2px solid var(--indigo-l)' : '2px solid transparent',
                                    textTransform: 'capitalize',
                                    transition: 'all .15s',
                                    marginBottom: -1,
                                  }}
                                >
                                  {tab === 'leaderboard' ? '🏆 Leaderboard' : '📊 Questions'}
                                </button>
                              ))}
                            </div>

                            {/* Tab: Leaderboard */}
                            {activeTab === 'leaderboard' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {results.leaderboard.length === 0 ? (
                                  <p style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No players joined this session.</p>
                                ) : results.leaderboard.map((player) => {
                                  const medals = ['🥇', '🥈', '🥉']
                                  const medal = medals[player.rank - 1] || null
                                  const maxScore = results.leaderboard[0]?.score || 1
                                  const pct = Math.round((player.score / maxScore) * 100)
                                  return (
                                    <div
                                      key={player.rank}
                                      style={{
                                        display: 'flex', alignItems: 'center', gap: 12,
                                        padding: '10px 14px', borderRadius: 10,
                                        background: player.rank === 1 ? 'rgba(251,191,36,.06)' : 'rgba(255,255,255,.02)',
                                        border: `1px solid ${player.rank === 1 ? 'rgba(251,191,36,.15)' : 'var(--border)'}`,
                                      }}
                                    >
                                      <span style={{ width: 28, textAlign: 'center', fontSize: player.rank <= 3 ? 18 : 13, fontWeight: 800, color: 'var(--text3)' }}>
                                        {medal || `#${player.rank}`}
                                      </span>
                                      <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{player.name}</span>
                                      {/* Score bar */}
                                      <div style={{ width: 100, height: 6, borderRadius: 3, background: 'rgba(255,255,255,.05)', overflow: 'hidden' }}>
                                        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: player.rank === 1 ? '#fbbf24' : 'var(--indigo)' }} />
                                      </div>
                                      <span style={{ fontWeight: 900, fontSize: 16, minWidth: 48, textAlign: 'right', color: player.rank === 1 ? '#fbbf24' : 'var(--text)' }}>
                                        {player.score}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            )}

                            {/* Tab: Questions */}
                            {activeTab === 'questions' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {results.questionStats.map((q, i) => (
                                  <div
                                    key={i}
                                    style={{
                                      padding: '14px 16px', borderRadius: 10,
                                      background: 'rgba(255,255,255,.02)', border: '1px solid var(--border)',
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                                      <div>
                                        <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, marginBottom: 3, textTransform: 'uppercase', letterSpacing: .5 }}>
                                          Q{i + 1}
                                        </div>
                                        <div style={{ fontWeight: 700, fontSize: 14 }}>{q.text}</div>
                                      </div>
                                      <div style={{
                                        padding: '4px 10px', borderRadius: 8, flexShrink: 0,
                                        background: q.correctRate >= 70 ? 'rgba(34,197,94,.1)' : q.correctRate >= 40 ? 'rgba(245,158,11,.1)' : 'rgba(239,68,68,.1)',
                                        color: q.correctRate >= 70 ? 'var(--green-l)' : q.correctRate >= 40 ? '#fbbf24' : '#f87171',
                                        fontSize: 13, fontWeight: 800,
                                      }}>
                                        {q.correctRate}% correct
                                      </div>
                                    </div>
                                    {/* Options bars */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                      {q.options.map((opt, oi) => {
                                        const isCorrect = oi === q.correctIndex
                                        const pct = q.percentages[oi] || 0
                                        return (
                                          <div key={oi} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{
                                              width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                                              background: isCorrect ? 'rgba(34,197,94,.15)' : 'rgba(255,255,255,.05)',
                                              fontSize: 10, fontWeight: 800, color: isCorrect ? 'var(--green-l)' : 'var(--text3)',
                                            }}>
                                              {String.fromCharCode(65 + oi)}
                                            </span>
                                            <div style={{ flex: 1, position: 'relative', height: 24, borderRadius: 6, overflow: 'hidden', background: 'rgba(255,255,255,.04)' }}>
                                              <div style={{
                                                position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 6,
                                                width: `${pct}%`,
                                                background: isCorrect ? 'rgba(34,197,94,.25)' : 'rgba(255,255,255,.06)',
                                                transition: 'width .4s',
                                              }} />
                                              <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 12, fontWeight: 600, zIndex: 1 }}>
                                                {opt}
                                              </span>
                                            </div>
                                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', minWidth: 36, textAlign: 'right' }}>
                                              {pct}%
                                            </span>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        ) : null}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Load More button */}
              {hasMore && (
                <div style={{ textAlign: 'center', paddingTop: 20 }}>
                  <button
                    className="btn btn-ghost"
                    onClick={loadMore}
                    disabled={loadingMore}
                    style={{ minWidth: 160 }}
                  >
                    {loadingMore
                      ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />Loading…</>
                      : <><span className="mat sm">expand_more</span>Load More Sessions</>
                    }
                  </button>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>
                    Showing {sessions.length} of {totalSessions} sessions
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            className="glass"
            style={{ borderRadius: 'var(--r2)', padding: 28, maxWidth: 420, width: '100%' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(239,68,68,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span className="mat" style={{ color: '#f87171' }}>delete_forever</span>
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>Delete Session</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>This action cannot be undone</div>
              </div>
            </div>

            <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 24, lineHeight: 1.6 }}>
              Are you sure you want to permanently delete the session for{' '}
              <strong style={{ color: 'var(--text)' }}>{deleteTarget.quizTitle}</strong>?
              All player scores and responses will be removed from the database.
            </p>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                className="btn btn-ghost"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting
                  ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />Deleting…</>
                  : <><span className="mat sm">delete</span>Delete Session</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getSessionResults, exportSessionPdf } from '../api/quizApi'
import Leaderboard from '../components/Leaderboard'

export default function ResultsPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    getSessionResults(sessionId)
      .then(data => setResults(data))
      .catch(err => setError(err.response?.data?.error || 'Failed to load results'))
      .finally(() => setLoading(false))
  }, [sessionId])

  async function handleExport() {
    setExporting(true)
    try {
      const quizTitle = results?.session?.quizTitle || 'results'
      const filename = `quizpulse-${quizTitle.replace(/\s+/g, '-').toLowerCase()}-${sessionId.slice(-6)}.pdf`
      await exportSessionPdf(sessionId, filename)
    } catch (err) {
      alert('Failed to export PDF')
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return <div className="loading-center"><div className="spinner" /></div>
  }

  if (!results) {
    return (
      <div className="loading-center">
        <div style={{ textAlign: 'center' }}>
          <span className="mat xl" style={{ fontSize: 48, color: 'var(--text3)', display: 'block', marginBottom: 16 }}>error_outline</span>
          <p style={{ color: 'var(--text2)', marginBottom: 8 }}>Results not found</p>
          {error && (
            <p style={{ color: 'var(--red, #f87171)', fontSize: 13, marginBottom: 20 }}>{error}</p>
          )}
          <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  const { session, leaderboard, questionStats } = results

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      {/* Topbar */}
      <div className="topbar">
        <div className="topbar-logo">QuizPulse</div>
        <div className="topbar-sep" />
        <span style={{ fontSize: 13, color: 'var(--text2)' }}>
          Dashboard / <strong style={{ color: 'var(--text)' }}>Results</strong>
        </span>
        <div className="topbar-right">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard')}>
            <span className="mat sm">arrow_back</span>Dashboard
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleExport}
            disabled={exporting}
          >
            <span className="mat sm">picture_as_pdf</span>
            {exporting ? 'Exporting...' : 'Export PDF'}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 36px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          {/* Header */}
          <div className="fade-up" style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span className="mat lg" style={{ color: 'var(--amber)' }}>emoji_events</span>
              <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-.5px' }}>
                {session?.quizTitle || 'Quiz Results'}
              </h1>
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {session?.roomCode && (
                <div className="badge badge-indigo" style={{ padding: '4px 12px' }}>
                  <span className="mat sm">tag</span> {session.roomCode}
                </div>
              )}
              {session?.totalPlayers !== undefined && (
                <div className="badge badge-green" style={{ padding: '4px 12px' }}>
                  <span className="mat sm">group</span> {session.totalPlayers} players
                </div>
              )}
              {session?.startedAt && (
                <div className="badge" style={{ padding: '4px 12px', background: 'rgba(255,255,255,.05)', border: '1px solid var(--border2)', color: 'var(--text2)' }}>
                  <span className="mat sm">calendar_today</span> {new Date(session.startedAt).toLocaleDateString()}
                </div>
              )}
            </div>
          </div>

          {/* Stats overview */}
          <div className="grid-4" style={{ marginBottom: 32, gap: 12 }}>
            <div className="stat-card">
              <div className="stat-label">Total Players</div>
              <div className="stat-val" style={{ color: 'var(--indigo-l)' }}>{session?.totalPlayers || 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Questions</div>
              <div className="stat-val">{questionStats?.length || 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Avg Accuracy</div>
              <div className="stat-val" style={{ color: 'var(--green-l)' }}>
                {questionStats?.length > 0
                  ? Math.round(questionStats.reduce((s, q) => s + (q.correctRate || 0), 0) / questionStats.length)
                  : 0}%
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Status</div>
              <div className="stat-val" style={{ fontSize: 18, color: session?.status === 'ended' ? 'var(--green-l)' : 'var(--amber)' }}>
                {session?.status === 'ended' ? '● Completed' : '● ' + (session?.status || 'Unknown')}
              </div>
            </div>
          </div>

          {/* Leaderboard */}
          {leaderboard && leaderboard.length > 0 && (
            <div className="fade-up" style={{ marginBottom: 40 }}>
              <div className="section-label" style={{ marginBottom: 16 }}>
                <span className="mat sm" style={{ marginRight: 6 }}>leaderboard</span>
                Final Leaderboard
              </div>

              {/* Podium for top 3 */}
              {leaderboard.length >= 3 && (
                <div className="podium-cols" style={{ marginBottom: 24 }}>
                  {/* 2nd place */}
                  <div className="pdm">
                    <div className="pdm-av" style={{ background: 'rgba(148,163,184,.12)', color: '#94a3b8' }}>
                      {leaderboard[1].name?.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="pdm-nm">{leaderboard[1].name}</div>
                    <div className="pdm-sc" style={{ color: 'var(--indigo-l)' }}>{leaderboard[1].score}</div>
                    <div className="pdm-bar" style={{ height: 80, background: 'rgba(148,163,184,.1)', border: '1px solid rgba(148,163,184,.2)' }}>
                      <span style={{ fontSize: 20, fontWeight: 900, color: '#94a3b8' }}>2</span>
                    </div>
                  </div>
                  {/* 1st place */}
                  <div className="pdm">
                    <div className="pdm-av" style={{ background: 'rgba(245,158,11,.15)', color: '#fbbf24' }}>
                      {leaderboard[0].name?.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="pdm-nm">{leaderboard[0].name}</div>
                    <div className="pdm-sc" style={{ color: 'var(--indigo-l)' }}>{leaderboard[0].score}</div>
                    <div className="pdm-bar" style={{ height: 110, background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.25)' }}>
                      <span style={{ fontSize: 24, fontWeight: 900, color: '#fbbf24' }}>1</span>
                    </div>
                  </div>
                  {/* 3rd place */}
                  <div className="pdm">
                    <div className="pdm-av" style={{ background: 'rgba(180,83,9,.12)', color: '#d97706' }}>
                      {leaderboard[2].name?.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="pdm-nm">{leaderboard[2].name}</div>
                    <div className="pdm-sc" style={{ color: 'var(--indigo-l)' }}>{leaderboard[2].score}</div>
                    <div className="pdm-bar" style={{ height: 60, background: 'rgba(180,83,9,.08)', border: '1px solid rgba(180,83,9,.2)' }}>
                      <span style={{ fontSize: 18, fontWeight: 900, color: '#d97706' }}>3</span>
                    </div>
                  </div>
                </div>
              )}

              <Leaderboard data={leaderboard.slice(0, 10)} />
            </div>
          )}

          {/* Per-question stats */}
          {questionStats && questionStats.length > 0 && (
            <div className="fade-up">
              <div className="section-label" style={{ marginBottom: 16 }}>
                <span className="mat sm" style={{ marginRight: 6 }}>analytics</span>
                Question Breakdown
              </div>
              {questionStats.map((qs, idx) => (
                <div key={idx} className="glass" style={{ borderRadius: 'var(--r2)', padding: 20, marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.8px', color: 'var(--indigo-l)', marginBottom: 4 }}>
                        Question {qs.index + 1}
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{qs.text}</div>
                    </div>
                    <div className="badge badge-green" style={{ flexShrink: 0 }}>
                      {qs.correctRate || 0}% correct
                    </div>
                  </div>

                  {/* Option bars */}
                  {qs.options?.map((opt, optIdx) => {
                    const isCorrect = optIdx === qs.correctIndex
                    const pct = qs.percentages?.[optIdx] || 0
                    const count = qs.votes?.[optIdx] || 0
                    return (
                      <div key={optIdx} className="chart-row">
                        <div className="chart-label" style={{ width: 140 }}>
                          <span style={{ fontWeight: 800, marginRight: 6, color: isCorrect ? 'var(--green-l)' : 'var(--text3)' }}>
                            {String.fromCharCode(65 + optIdx)}
                          </span>
                          {opt}
                          {isCorrect && <span className="mat sm fill" style={{ color: 'var(--green)', marginLeft: 4, fontSize: 14 }}>check_circle</span>}
                        </div>
                        <div className="chart-bar-wrap">
                          <div
                            className="chart-bar"
                            style={{
                              width: `${Math.max(pct, 2)}%`,
                              background: isCorrect
                                ? 'linear-gradient(90deg, rgba(34,197,94,.3), rgba(34,197,94,.15))'
                                : 'linear-gradient(90deg, rgba(99,102,241,.25), rgba(99,102,241,.1))',
                            }}
                          />
                          <span className="chart-bar-text" style={{ fontSize: 12, fontWeight: 700 }}>
                            {count}
                          </span>
                        </div>
                        <div className="chart-pct">{pct}%</div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}

          {/* Back button */}
          <div style={{ textAlign: 'center', marginTop: 32, marginBottom: 48 }}>
            <button className="btn btn-ghost btn-lg" onClick={() => navigate('/dashboard')}>
              <span className="mat">arrow_back</span>Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

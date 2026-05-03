/**
 * QuizPulse — Mentimeter-style PDF Report
 *
 * Design principles (matching Mentimeter):
 *  - White/off-white background, light and airy
 *  - Generous padding and whitespace — nothing feels cramped
 *  - Inter/system sans-serif at large sizes
 *  - Soft pastel accent cards with bold numbers
 *  - Horizontal bars with rounded caps and soft colors
 *  - Subtle box-shadows instead of hard borders
 *  - Leaderboard as clean numbered rows, not a table
 *
 * Pages:
 *  1       Cover         — brand bar, title, date/room, 4 stat pills, top-3 podium
 *  2       Overview      — accuracy per question, summary chips
 *  3…N     Questions     — one per page, large bar chart + answer label
 *  N+1     Leaderboard   — podium + full ranked list
 */

const puppeteer = require('puppeteer')

const initials  = (name = '') => name.trim().slice(0, 2).toUpperCase()
const fmt       = (n)         => Number(n).toLocaleString('en-US')
const clamp     = (v, lo, hi) => Math.min(Math.max(v, lo), hi)

const BAR_COLORS = ['#7C6AF7', '#4FC4CF', '#FF8C69', '#FFB347', '#69C369', '#FF6B9D']
const rankMedals = ['🥇', '🥈', '🥉']

async function generateSessionPDF(session, quiz) {
  const leaderboard = [...session.players].sort((a, b) => b.score - a.score)

  const questionStats = quiz.questions.map((q, i) => {
    const snap  = session.voteSnapshots.find((v) => v.questionIndex === i)
    const votes = snap ? snap.votes : new Array(q.options.length).fill(0)
    const total = votes.reduce((a, b) => a + b, 0)
    const percentages = votes.map((v) => (total > 0 ? Math.round((v / total) * 100) : 0))
    const correctRate = percentages[q.correctIndex] ?? 0
    return { ...q.toObject(), votes, total, percentages, correctRate, index: i }
  })

  const avgAccuracy = questionStats.length
    ? Math.round(questionStats.reduce((s, q) => s + q.correctRate, 0) / questionStats.length) : 0
  const avgScore = session.players.length
    ? Math.round(session.players.reduce((s, p) => s + p.score, 0) / session.players.length) : 0
  const dateStr = session.startedAt
    ? new Date(session.startedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'N/A'
  const timeStr = session.startedAt
    ? new Date(session.startedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : ''

  const html = buildHTML({ session, quiz, questionStats, leaderboard, avgAccuracy, avgScore, dateStr, timeStr })

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: 'new'
  })
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    })
  } finally {
    await browser.close()
  }
}

const CSS = `
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    background: #ffffff;
    color: #1a1a2e;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    font-size: 14px;
    line-height: 1.5;
  }

  .page {
    width: 210mm;
    min-height: 297mm;
    background: #ffffff;
    page-break-after: always;
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .page:last-child { page-break-after: avoid; }

  .brand-bar {
    height: 6px;
    background: linear-gradient(90deg, #7C6AF7 0%, #4FC4CF 50%, #FF8C69 100%);
    flex-shrink: 0;
  }

  .page-header {
    padding: 22px 48px 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }
  .page-header-logo { font-size: 13px; font-weight: 800; color: #7C6AF7; letter-spacing: -0.3px; }
  .page-header-meta { font-size: 11px; color: #9CA3AF; font-weight: 500; }

  .page-footer {
    margin-top: auto;
    padding: 12px 48px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-top: 1px solid #F3F4F6;
    flex-shrink: 0;
  }
  .page-footer span { font-size: 10px; color: #D1D5DB; font-weight: 500; }

  .content { padding: 20px 48px 0; flex: 1; display: flex; flex-direction: column; }

  .section-eyebrow {
    font-size: 11px; font-weight: 700; letter-spacing: 0.12em;
    text-transform: uppercase; color: #7C6AF7; margin-bottom: 5px;
  }
  .section-title {
    font-size: 26px; font-weight: 800; color: #111827;
    letter-spacing: -0.5px; line-height: 1.2; margin-bottom: 4px;
  }
  .section-sub { font-size: 13px; color: #6B7280; margin-bottom: 20px; }
  .divider { height: 1px; background: #F3F4F6; margin: 16px 0; flex-shrink: 0; }

  /* COVER */
  .cover-content { padding: 36px 48px 0; flex: 1; display: flex; flex-direction: column; }
  .cover-eyebrow {
    display: inline-flex; align-items: center; gap: 7px;
    background: #F5F3FF; color: #7C6AF7;
    font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
    padding: 6px 14px; border-radius: 100px; margin-bottom: 20px; width: fit-content;
  }
  .cover-title {
    font-size: 44px; font-weight: 900; color: #111827;
    letter-spacing: -1.5px; line-height: 1.1; margin-bottom: 12px; max-width: 480px;
  }
  .cover-meta-row { display: flex; align-items: center; gap: 16px; margin-bottom: 32px; flex-wrap: wrap; }
  .cover-meta-item { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #6B7280; font-weight: 500; }
  .cover-meta-dot { width: 4px; height: 4px; border-radius: 50%; background: #D1D5DB; }

  .stat-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 32px; }
  .stat-pill {
    background: #FAFAFA; border: 1.5px solid #F3F4F6;
    border-radius: 16px; padding: 18px 16px 14px;
    display: flex; flex-direction: column; gap: 4px;
  }
  .stat-pill-val { font-size: 32px; font-weight: 900; letter-spacing: -1px; line-height: 1; }
  .stat-pill-lbl { font-size: 10px; font-weight: 600; color: #9CA3AF; letter-spacing: 0.06em; text-transform: uppercase; }
  .color-purple { color: #7C6AF7; }
  .color-teal   { color: #4FC4CF; }
  .color-orange { color: #FF8C69; }
  .color-dark   { color: #111827; }

  .podium-card {
    background: #FAFAFA; border: 1.5px solid #F3F4F6;
    border-radius: 20px; padding: 22px 28px 18px;
  }
  .podium-card-title {
    font-size: 11px; font-weight: 700; letter-spacing: 0.1em;
    text-transform: uppercase; color: #9CA3AF; margin-bottom: 22px;
  }
  .podium-slots { display: flex; align-items: flex-end; justify-content: center; }
  .podium-slot  { display: flex; flex-direction: column; align-items: center; flex: 1; }
  .podium-avatar {
    width: 46px; height: 46px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; font-weight: 800; color: #fff; margin-bottom: 7px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.12);
  }
  .av-1 { background: linear-gradient(135deg,#F59E0B,#FBBF24); }
  .av-2 { background: linear-gradient(135deg,#6B7280,#9CA3AF); }
  .av-3 { background: linear-gradient(135deg,#CD7C2E,#D97706); }
  .av-n { background: linear-gradient(135deg,#7C6AF7,#4FC4CF); }
  .podium-name {
    font-size: 12px; font-weight: 700; color: #374151; margin-bottom: 2px;
    text-align: center; max-width: 90px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .podium-score { font-size: 13px; font-weight: 800; margin-bottom: 8px; }
  .podium-block {
    width: 78px; border-radius: 10px 10px 0 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 20px; font-weight: 900; color: rgba(0,0,0,0.25);
  }
  .pb-1 { height: 68px; background: linear-gradient(180deg,#FDE68A,#F59E0B); }
  .pb-2 { height: 50px; background: linear-gradient(180deg,#E5E7EB,#9CA3AF); }
  .pb-3 { height: 36px; background: linear-gradient(180deg,#FCD9A0,#CD7C2E); }

  /* OVERVIEW */
  .overview-list { display: flex; flex-direction: column; gap: 13px; }
  .overview-item { display: flex; align-items: center; gap: 12px; }
  .ov-num {
    width: 30px; height: 30px; border-radius: 8px;
    background: #F5F3FF; color: #7C6AF7;
    font-size: 11px; font-weight: 800;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .ov-label { width: 150px; font-size: 12px; font-weight: 600; color: #374151; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ov-track { flex: 1; height: 12px; background: #F3F4F6; border-radius: 100px; overflow: hidden; }
  .ov-fill  { height: 100%; border-radius: 100px; }
  .ov-fill-green { background: linear-gradient(90deg,#4FC4CF,#69D9A3); }
  .ov-fill-amber { background: linear-gradient(90deg,#FFB347,#FFCF73); }
  .ov-fill-red   { background: linear-gradient(90deg,#FF8C69,#FFB5A0); }
  .ov-pct { width: 40px; text-align: right; font-size: 13px; font-weight: 800; flex-shrink: 0; }

  .summary-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 24px; }
  .chip {
    display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px;
    background: #F9FAFB; border: 1.5px solid #F3F4F6;
    border-radius: 100px; font-size: 11px; font-weight: 600; color: #374151;
  }

  /* QUESTION PAGES */
  .q-progress-row { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
  .q-progress-label { font-size: 11px; font-weight: 700; color: #9CA3AF; letter-spacing: 0.08em; text-transform: uppercase; }
  .q-progress-track { flex: 1; height: 4px; background: #F3F4F6; border-radius: 2px; overflow: hidden; }
  .q-progress-fill  { height: 100%; background: #7C6AF7; border-radius: 2px; }
  .q-text { font-size: 24px; font-weight: 800; color: #111827; letter-spacing: -0.5px; line-height: 1.3; margin-bottom: 6px; }
  .q-response-count { font-size: 12px; color: #9CA3AF; font-weight: 500; margin-bottom: 20px; }
  .correct-answer-tag {
    display: inline-flex; align-items: center; gap: 6px;
    background: #ECFDF5; border: 1.5px solid #A7F3D0; color: #059669;
    font-size: 12px; font-weight: 700; padding: 6px 14px; border-radius: 100px; margin-bottom: 24px;
  }
  .option-bars { display: flex; flex-direction: column; gap: 12px; }
  .option-row  { display: flex; flex-direction: column; gap: 5px; }
  .option-header { display: flex; align-items: center; gap: 10px; }
  .option-letter {
    width: 26px; height: 26px; border-radius: 7px;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 800; flex-shrink: 0;
  }
  .ol-correct { background: #D1FAE5; color: #059669; }
  .ol-wrong   { background: #F3F4F6; color: #9CA3AF; }
  .option-text-correct { font-size: 13px; font-weight: 700; color: #059669; flex: 1; }
  .option-text-wrong   { font-size: 13px; font-weight: 500; color: #374151; flex: 1; }
  .option-pct   { font-size: 13px; font-weight: 800; color: #111827; min-width: 42px; text-align: right; flex-shrink: 0; }
  .option-votes { font-size: 11px; color: #9CA3AF; min-width: 52px; text-align: right; flex-shrink: 0; }
  .bar-track { height: 18px; background: #F3F4F6; border-radius: 100px; overflow: hidden; margin-left: 36px; }

  /* LEADERBOARD */
  .lb-podium { display: flex; align-items: flex-end; justify-content: center; gap: 6px; margin: 0 0 24px; }
  .lb-slot   { display: flex; flex-direction: column; align-items: center; }
  .lb-avatar { width: 50px; height: 50px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 800; color: #fff; margin-bottom: 7px; box-shadow: 0 4px 14px rgba(0,0,0,0.1); }
  .lb-name   { font-size: 12px; font-weight: 700; color: #374151; margin-bottom: 2px; text-align: center; max-width: 90px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lb-score  { font-size: 13px; font-weight: 800; margin-bottom: 8px; }
  .lb-block  { border-radius: 10px 10px 0 0; display: flex; align-items: center; justify-content: center; font-size: 21px; font-weight: 900; color: rgba(0,0,0,0.22); }
  .lb-b1 { width: 88px; height: 72px; background: linear-gradient(180deg,#FDE68A,#F59E0B); }
  .lb-b2 { width: 78px; height: 54px; background: linear-gradient(180deg,#E5E7EB,#9CA3AF); }
  .lb-b3 { width: 68px; height: 40px; background: linear-gradient(180deg,#FCD9A0,#CD7C2E); }

  .lb-list { display: flex; flex-direction: column; gap: 2px; }
  .lb-row {
    display: flex; align-items: center; gap: 12px;
    padding: 11px 14px; border-radius: 10px;
  }
  .lb-row-top { background: #FFFBEB; }
  .lb-row:not(.lb-row-top):nth-child(even) { background: #FAFAFA; }
  .lb-rank       { font-size: 15px; font-weight: 900; width: 28px; text-align: center; flex-shrink: 0; }
  .lb-av         { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; color: #fff; flex-shrink: 0; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
  .lb-player-name{ font-size: 13px; font-weight: 600; color: #111827; flex: 1; }
  .lb-score-bar-wrap { display: flex; align-items: center; gap: 10px; width: 190px; flex-shrink: 0; }
  .lb-score-track{ flex: 1; height: 7px; background: #F3F4F6; border-radius: 100px; overflow: hidden; }
  .lb-score-fill { height: 100%; border-radius: 100px; background: linear-gradient(90deg,#7C6AF7,#4FC4CF); }
  .lb-score-val  { font-size: 13px; font-weight: 800; color: #111827; min-width: 46px; text-align: right; }
`

function footer(num, total, quizTitle) {
  return `<div class="page-footer"><span>QuizPulse &mdash; ${quizTitle}</span><span>Page ${num} of ${total}</span></div>`
}

function pageHeader(quizTitle, rightText) {
  return `<div class="page-header"><div class="page-header-logo">QuizPulse</div><div class="page-header-meta">${quizTitle} &nbsp;·&nbsp; ${rightText}</div></div>`
}

function avatarClass(rank) { return ['av-1','av-2','av-3'][rank] ?? 'av-n' }

function ovFillClass(pct) {
  if (pct >= 60) return 'ov-fill-green'
  if (pct >= 30) return 'ov-fill-amber'
  return 'ov-fill-red'
}
function ovPctColor(pct) {
  if (pct >= 60) return '#4FC4CF'
  if (pct >= 30) return '#FFB347'
  return '#FF8C69'
}

function buildHTML({ session, quiz, questionStats, leaderboard, avgAccuracy, avgScore, dateStr, timeStr }) {
  const totalPages = 1 + 1 + questionStats.length + 1
  const LETTERS = ['A','B','C','D','E','F']

  /* PAGE 1 — COVER */
  const top3 = leaderboard.slice(0, 3)
  const podiumOrder = [
    { idx: 1, blockClass: 'pb-2', label: '2' },
    { idx: 0, blockClass: 'pb-1', label: '1', crown: true },
    { idx: 2, blockClass: 'pb-3', label: '3' },
  ]
  const podiumHTML = podiumOrder.map(({ idx, blockClass, label, crown }) => {
    const p = top3[idx]
    if (!p) return '<div class="podium-slot"></div>'
    const scoreColor = ['#F59E0B','#9CA3AF','#CD7C2E'][idx] ?? '#7C6AF7'
    return `<div class="podium-slot">
      <div style="font-size:16px;margin-bottom:5px;text-align:center">${crown ? '&#128081;' : '&nbsp;'}</div>
      <div class="podium-avatar ${avatarClass(idx)}">${initials(p.name)}</div>
      <div class="podium-name">${p.name}</div>
      <div class="podium-score" style="color:${scoreColor}">${fmt(p.score)}</div>
      <div class="podium-block ${blockClass}">${label}</div>
    </div>`
  }).join('')

  const coverPage = `
  <div class="page">
    <div class="brand-bar"></div>
    <div class="cover-content">
      <div class="cover-eyebrow">&#10022; Quiz Results Report</div>
      <div class="cover-title">${quiz.title}</div>
      <div class="cover-meta-row">
        <div class="cover-meta-item">&#128197; ${dateStr}${timeStr ? ` at ${timeStr}` : ''}</div>
        <div class="cover-meta-dot"></div>
        <div class="cover-meta-item">&#127991; Room ${session.roomCode}</div>
        ${quiz.description ? `<div class="cover-meta-dot"></div><div class="cover-meta-item">${quiz.description}</div>` : ''}
      </div>
      <div class="stat-row">
        <div class="stat-pill"><div class="stat-pill-val color-purple">${session.players.length}</div><div class="stat-pill-lbl">Participants</div></div>
        <div class="stat-pill"><div class="stat-pill-val color-dark">${quiz.questions.length}</div><div class="stat-pill-lbl">Questions</div></div>
        <div class="stat-pill"><div class="stat-pill-val color-teal">${avgAccuracy}%</div><div class="stat-pill-lbl">Avg Accuracy</div></div>
        <div class="stat-pill"><div class="stat-pill-val color-orange">${fmt(avgScore)}</div><div class="stat-pill-lbl">Avg Score</div></div>
      </div>
      <div class="podium-card">
        <div class="podium-card-title">&#127942; Top Performers</div>
        <div class="podium-slots">${podiumHTML}</div>
      </div>
    </div>
    ${footer(1, totalPages, quiz.title)}
  </div>`

  /* PAGE 2 — OVERVIEW */
  const ovItems = questionStats.map(q => {
    const pct = q.correctRate
    return `<div class="overview-item">
      <div class="ov-num">Q${q.index + 1}</div>
      <div class="ov-label">${q.text}</div>
      <div class="ov-track"><div class="ov-fill ${ovFillClass(pct)}" style="width:${clamp(pct, pct > 0 ? 2 : 0, 100)}%"></div></div>
      <div class="ov-pct" style="color:${ovPctColor(pct)}">${pct}%</div>
    </div>`
  }).join('')

  const highestQ = [...questionStats].sort((a,b) => b.correctRate - a.correctRate)[0]
  const lowestQ  = [...questionStats].sort((a,b) => a.correctRate - b.correctRate)[0]

  const overviewPage = `
  <div class="page">
    <div class="brand-bar"></div>
    ${pageHeader(quiz.title, dateStr)}
    <div class="content">
      <div class="section-eyebrow">Session Overview</div>
      <div class="section-title">Question Accuracy</div>
      <div class="section-sub">How well participants answered each question</div>
      <div class="overview-list">${ovItems}</div>
      <div class="divider"></div>
      <div class="summary-chips">
        <div class="chip">&#128101; ${session.players.length} participants</div>
        <div class="chip">&#10067; ${quiz.questions.length} questions</div>
        <div class="chip">&#127919; ${avgAccuracy}% average accuracy</div>
        ${highestQ ? `<div class="chip">&#11014; Best: Q${highestQ.index + 1} (${highestQ.correctRate}%)</div>` : ''}
        ${lowestQ && lowestQ.index !== (highestQ && highestQ.index) ? `<div class="chip">&#11015; Hardest: Q${lowestQ.index + 1} (${lowestQ.correctRate}%)</div>` : ''}
      </div>
    </div>
    ${footer(2, totalPages, quiz.title)}
  </div>`

  /* QUESTION PAGES */
  const questionPages = questionStats.map((q, qi) => {
    const progressPct = Math.round(((qi + 1) / questionStats.length) * 100)
    const optBars = q.options.map((opt, oi) => {
      const isCorrect = oi === q.correctIndex
      const pct = q.percentages[oi] ?? 0
      const barWidth = clamp(pct, pct > 0 ? 2 : 0, 100)
      const barColor = BAR_COLORS[oi % BAR_COLORS.length]
      return `<div class="option-row">
        <div class="option-header">
          <div class="option-letter ${isCorrect ? 'ol-correct' : 'ol-wrong'}">${LETTERS[oi]}</div>
          <div class="${isCorrect ? 'option-text-correct' : 'option-text-wrong'}">${opt}</div>
          <div class="option-pct">${pct}%</div>
          <div class="option-votes">${q.votes[oi]} votes</div>
        </div>
        <div class="bar-track">
          <div style="width:${barWidth}%;height:100%;border-radius:100px;background:${isCorrect ? 'linear-gradient(90deg,#4FC4CF,#69D9A3)' : barColor + '66'};"></div>
        </div>
      </div>`
    }).join('')

    return `<div class="page">
      <div class="brand-bar"></div>
      ${pageHeader(quiz.title, `Question ${q.index + 1} of ${questionStats.length}`)}
      <div class="content">
        <div class="q-progress-row">
          <div class="q-progress-label">Progress</div>
          <div class="q-progress-track"><div class="q-progress-fill" style="width:${progressPct}%"></div></div>
          <div style="font-size:11px;font-weight:700;color:#7C6AF7;min-width:30px;text-align:right">${progressPct}%</div>
        </div>
        <div class="divider" style="margin:10px 0 16px"></div>
        <div class="q-text">${q.text}</div>
        <div class="q-response-count">${q.total} response${q.total !== 1 ? 's' : ''}</div>
        <div class="correct-answer-tag">&#10003; Correct answer: <strong>${q.options[q.correctIndex]}</strong> &nbsp;&#183;&nbsp; ${q.correctRate}% got it right</div>
        <div class="option-bars">${optBars}</div>
      </div>
      ${footer(3 + qi, totalPages, quiz.title)}
    </div>`
  }).join('')

  /* LEADERBOARD PAGE */
  const lb3 = leaderboard.slice(0, 3)
  const lbPodiumOrder = [
    { idx: 1, blockClass: 'lb-b2', label: '2' },
    { idx: 0, blockClass: 'lb-b1', label: '1', crown: true },
    { idx: 2, blockClass: 'lb-b3', label: '3' },
  ]
  const lbPodiumHTML = lbPodiumOrder.map(({ idx, blockClass, label, crown }) => {
    const p = lb3[idx]
    if (!p) return '<div class="lb-slot"></div>'
    const scoreColor = ['#F59E0B','#9CA3AF','#CD7C2E'][idx] ?? '#7C6AF7'
    return `<div class="lb-slot">
      <div style="font-size:19px;margin-bottom:7px;text-align:center">${crown ? '&#128081;' : '&nbsp;'}</div>
      <div class="lb-avatar ${avatarClass(idx)}">${initials(p.name)}</div>
      <div class="lb-name">${p.name}</div>
      <div class="lb-score" style="color:${scoreColor}">${fmt(p.score)}</div>
      <div class="lb-block ${blockClass}">${label}</div>
    </div>`
  }).join('')

  const topScore = leaderboard[0]?.score || 1
  const lbRows = leaderboard.map((p, ri) => {
    const avClass = avatarClass(ri)
    const barPct = Math.round((p.score / topScore) * 100)
    const rankDisplay = rankMedals[ri] ?? `#${ri + 1}`
    return `<div class="lb-row ${ri < 3 ? 'lb-row-top' : ''}">
      <div class="lb-rank" style="color:${['#F59E0B','#9CA3AF','#CD7C2E'][ri] ?? '#6B7280'}">${rankDisplay}</div>
      <div class="lb-av ${avClass}">${initials(p.name)}</div>
      <div class="lb-player-name">${p.name}</div>
      <div class="lb-score-bar-wrap">
        <div class="lb-score-track"><div class="lb-score-fill" style="width:${barPct}%"></div></div>
        <div class="lb-score-val">${fmt(p.score)}</div>
      </div>
    </div>`
  }).join('')

  const leaderboardPage = `
  <div class="page">
    <div class="brand-bar"></div>
    ${pageHeader(quiz.title, dateStr)}
    <div class="content">
      <div class="section-eyebrow">Final Results</div>
      <div class="section-title">Leaderboard</div>
      <div class="section-sub">${leaderboard.length} participants &nbsp;&#183;&nbsp; ${quiz.questions.length} questions &nbsp;&#183;&nbsp; Room ${session.roomCode}</div>
      ${lb3.length > 0 ? `<div class="lb-podium">${lbPodiumHTML}</div><div class="divider"></div>` : ''}
      <div class="lb-list">${lbRows || '<div style="text-align:center;padding:32px 0;color:#9CA3AF;font-size:14px">No participants joined this session.</div>'}</div>
    </div>
    ${footer(totalPages, totalPages, quiz.title)}
  </div>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${quiz.title} &mdash; Quiz Report</title>
  <style>${CSS}</style>
</head>
<body>${coverPage}${overviewPage}${questionPages}${leaderboardPage}</body>
</html>`
}

module.exports = { generateSessionPDF }
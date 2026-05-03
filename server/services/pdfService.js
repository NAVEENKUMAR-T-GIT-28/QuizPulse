/**
 * QuizPulse — Professional PDF Report Service
 * Pages:
 *  1   Cover          — quiz title, date, stat cards, top-3 podium
 *  2   Session Overview — accuracy bars per question
 *  3…N Question Pages — option bars + mini leaderboard (tight, no gaps)
 *  N+1 Final Leaderboard — podium + full ranked table
 */

const puppeteer = require('puppeteer')

const initials  = (name = '') => name.trim().slice(0, 2).toUpperCase()
const fmt       = (n) => Number(n).toLocaleString('en-US')
const clamp     = (v, lo, hi) => Math.min(Math.max(v, lo), hi)
const rankColor = (i) => ['#F59E0B', '#94A3B8', '#CD7C2E'][i] ?? '#64748B'

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

  const html = buildHTML({ session, quiz, questionStats, leaderboard, avgAccuracy, avgScore, dateStr })

  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'], headless: 'new' })
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

function buildHTML({ session, quiz, questionStats, leaderboard, avgAccuracy, avgScore, dateStr }) {
  const totalPages = 1 + 1 + questionStats.length + 1
  const LETTERS    = ['A', 'B', 'C', 'D']

  /* ─── helpers ─────────────────────────────────────────────────────────── */
  const fillClass  = (pct) => pct >= 50 ? 'ov-fill-green' : pct >= 25 ? 'ov-fill-yellow' : 'ov-fill-red'
  const pctColor   = (pct) => pct >= 50 ? '#10B981' : pct >= 25 ? '#F59E0B' : '#EF4444'
  const badgeClass = (pct) => pct >= 50 ? 'badge-green' : pct >= 25 ? 'badge-yellow' : 'badge-red'

  const footer = (num) => `
    <div class="page-footer">
      <span>QuizPulse Report &mdash; ${quiz.title}</span>
      <span>Page ${num} of ${totalPages}</span>
    </div>`

  /* ─── CSS ──────────────────────────────────────────────────────────────── */
  const css = `
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0F172A;
      color: #F8FAFC;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* ── PAGE SHELL ── */
    .page {
      width: 210mm;
      min-height: 297mm;
      page-break-after: always;
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      background: #0F172A;
    }
    .page:last-child { page-break-after: avoid; }

    /* top accent stripe */
    .stripe { height: 4px; width: 100%; flex-shrink: 0; }
    .stripe-indigo { background: linear-gradient(90deg,#6366F1,#8B5CF6); }
    .stripe-gold   { background: linear-gradient(90deg,#F59E0B,#FBBF24); }

    /* ── FOOTER ── */
    .page-footer {
      padding: 9px 50px 13px;
      display: flex;
      justify-content: space-between;
      border-top: 1px solid #1E293B;
      flex-shrink: 0;
    }
    .page-footer span { font-size: 9px; color: #475569; letter-spacing: .04em; }

    /* ── TYPOGRAPHY ── */
    .label        { font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #8B5CF6; }
    .section-title{ font-size: 30px; font-weight: 800; color: #F8FAFC; line-height: 1.15; margin-top: 5px; }
    .divider      { height: 1px; background: #1E293B; margin: 14px 0; flex-shrink: 0; }

    /* ════════════════════════════════════════════
       PAGE 1 — COVER
    ════════════════════════════════════════════ */
    .cover-inner {
      flex: 1;
      padding: 40px 50px 20px;
      display: flex;
      flex-direction: column;
    }
    .cover-blob { position: absolute; border-radius: 50%; pointer-events: none; opacity: .45; }
    .blob-1 { width: 260px; height: 260px; top: -70px;  right: -70px;  background: radial-gradient(circle,#312E81 0%,transparent 70%); }
    .blob-2 { width: 200px; height: 200px; bottom: 80px; left: -50px;  background: radial-gradient(circle,#0C4A6E 0%,transparent 70%); }
    .blob-3 { width: 150px; height: 150px; bottom: 230px;right: 40px;  background: radial-gradient(circle,#4C1D95 0%,transparent 70%); }

    .cover-badge {
      display: inline-flex; align-items: center; gap: 6px;
      background: #1E1B4B; color: #A78BFA;
      font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase;
      padding: 5px 14px; border-radius: 100px; border: 1px solid #312E81;
      width: fit-content; margin-bottom: 20px;
    }
    .cover-title      { font-size: 44px; font-weight: 900; color: #F8FAFC; line-height: 1.1; letter-spacing: -.02em; margin-bottom: 8px; }
    .cover-underline  { height: 4px; width: 80px; background: linear-gradient(90deg,#6366F1,#8B5CF6); border-radius: 2px; margin-bottom: 10px; }
    .cover-desc       { font-size: 14px; color: #94A3B8; margin-bottom: 5px; }
    .cover-meta       { font-size: 12px; color: #475569; margin-bottom: 28px; }

    .stat-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 11px; margin-bottom: 28px; }
    .stat-card { background: #1E293B; border: 1px solid #334155; border-radius: 12px; padding: 16px 14px 12px; text-align: center; }
    .stat-card .val { font-size: 28px; font-weight: 800; color: #A78BFA; line-height: 1; margin-bottom: 5px; }
    .stat-card .lbl { font-size: 9px;  font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: #64748B; }

    .podium-section { background: #1E293B; border: 1px solid #334155; border-radius: 14px; padding: 20px 28px 18px; }
    .podium-title   { font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #64748B; margin-bottom: 18px; }
    .podium         { display: flex; justify-content: center; align-items: flex-end; }
    .podium-slot    { display: flex; flex-direction: column; align-items: center; flex: 1; }
    .avatar         { width: 46px; height: 46px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 15px; color: #0F172A; margin-bottom: 7px; }
    .podium-name    { font-size: 12px; font-weight: 700; color: #E2E8F0; margin-bottom: 2px; text-align: center; }
    .podium-score   { font-size: 13px; font-weight: 800; margin-bottom: 8px; }
    .podium-block   { width: 70px; border-radius: 8px 8px 0 0; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 900; color: #0F172A; }
    .podium-1st     { height: 68px; background: #F59E0B; }
    .podium-2nd     { height: 50px; background: #94A3B8; }
    .podium-3rd     { height: 38px; background: #CD7C2E; }
    .crown          { font-size: 17px; margin-bottom: 4px; display: block; text-align: center; }

    /* ════════════════════════════════════════════
       PAGE 2 — SESSION OVERVIEW
    ════════════════════════════════════════════ */
    .page-inner { flex: 1; padding: 36px 50px 20px; display: flex; flex-direction: column; }

    .overview-bars  { display: flex; flex-direction: column; gap: 14px; margin-top: 6px; }
    .overview-row   { display: flex; align-items: center; gap: 11px; }
    .ov-qlabel      { font-size: 13px; font-weight: 700; color: #F8FAFC; width: 28px; flex-shrink: 0; }
    .ov-qtext       { font-size: 11px; color: #94A3B8; width: 120px; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ov-track       { flex: 1; height: 17px; background: #1E3A5F; border-radius: 9px; overflow: hidden; }
    .ov-fill        { height: 100%; border-radius: 9px; }
    .ov-fill-green  { background: linear-gradient(90deg,#059669,#10B981); }
    .ov-fill-yellow { background: linear-gradient(90deg,#D97706,#F59E0B); }
    .ov-fill-red    { background: linear-gradient(90deg,#DC2626,#EF4444); }
    .ov-pct         { font-size: 13px; font-weight: 800; width: 40px; text-align: right; flex-shrink: 0; }

    .summary-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; margin-top: 24px; }
    .summary-card { background: #1E293B; border: 1px solid #334155; border-radius: 10px; padding: 13px 11px 10px; text-align: center; }
    .summary-card .s-val { font-size: 21px; font-weight: 800; color: #A78BFA; line-height: 1; margin-bottom: 4px; }
    .summary-card .s-lbl { font-size: 9px;  font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: #64748B; }

    /* ════════════════════════════════════════════
       QUESTION PAGES  ← KEY FIX: no flex:1 on
       option-bars so content stays top-aligned
    ════════════════════════════════════════════ */
    .q-page-inner {
      /* Fixed padding — no flex stretching */
      padding: 36px 50px 24px;
      display: flex;
      flex-direction: column;
    }

    .q-meta        { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .q-num-badge   { font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #64748B; }
    .q-badge       { font-size: 10px; font-weight: 700; padding: 4px 11px; border-radius: 100px; }
    .badge-green   { background: #064E3B; color: #10B981; }
    .badge-yellow  { background: #451A03; color: #F59E0B; }
    .badge-red     { background: #450A0A; color: #EF4444; }

    .q-text        { font-size: 24px; font-weight: 800; color: #F8FAFC; line-height: 1.25; margin-bottom: 10px; }

    .correct-pill  {
      display: inline-flex; align-items: center; gap: 5px;
      background: #064E3B; border: 1px solid #065F46; border-radius: 7px;
      padding: 5px 12px; font-size: 11px; font-weight: 600; color: #10B981;
      margin-bottom: 18px;
    }

    /* Option bars — NO flex:1, height driven purely by content */
    .option-bars   { display: flex; flex-direction: column; gap: 11px; }

    .option-row    { display: flex; flex-direction: column; gap: 4px; }
    .option-header { display: flex; align-items: center; gap: 8px; }

    .opt-letter    { width: 24px; height: 24px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; }
    .opt-lc        { background: #059669; color: #fff; }
    .opt-lw        { background: #1E293B; color: #94A3B8; }
    .opt-label-c   { font-size: 13px; font-weight: 700; color: #10B981; flex: 1; }
    .opt-label-w   { font-size: 13px; font-weight: 400; color: #94A3B8; flex: 1; }
    .opt-pct       { font-size: 13px; font-weight: 800; width: 38px; text-align: right; flex-shrink: 0; }
    .opt-votes     { font-size: 10px; color: #475569; width: 38px; text-align: right; flex-shrink: 0; }

    .bar-track-q   { height: 13px; background: #1E293B; border-radius: 7px; overflow: hidden; }
    .bar-fill-c    { background: linear-gradient(90deg,#059669,#10B981); height: 100%; border-radius: 7px; }
    .bar-fill-w    { background: #334155; height: 100%; border-radius: 7px; }

    /* Mini leaderboard */
    .mini-lb       { background: #1E293B; border: 1px solid #334155; border-radius: 11px; padding: 13px 17px; margin-top: 20px; }
    .mini-lb-title { font-size: 9px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #475569; margin-bottom: 10px; }
    .mini-lb-rows  { display: flex; flex-direction: column; gap: 7px; }
    .mini-lb-row   { display: flex; align-items: center; gap: 10px; }
    .mini-rank     { font-size: 13px; font-weight: 800; width: 18px; flex-shrink: 0; }
    .mini-avatar   { width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 800; color: #0F172A; flex-shrink: 0; }
    .mini-name     { font-size: 12px; font-weight: 600; color: #E2E8F0; flex: 1; }
    .mini-score    { font-size: 12px; font-weight: 800; }

    /* ════════════════════════════════════════════
       FINAL LEADERBOARD PAGE
    ════════════════════════════════════════════ */
    .chips { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 9px; margin-bottom: 5px; }
    .chip  { background: #1E293B; border: 1px solid #334155; border-radius: 100px; padding: 4px 12px; font-size: 10px; color: #94A3B8; }

    .final-podium  { display: flex; justify-content: center; align-items: flex-end; gap: 10px; padding: 0 12px; margin: 14px 0 18px; }
    .fp-slot       { display: flex; flex-direction: column; align-items: center; }
    .fp-avatar     { width: 50px; height: 50px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 800; color: #0F172A; margin-bottom: 6px; }
    .fp-name       { font-size: 12px; font-weight: 700; color: #E2E8F0; margin-bottom: 2px; text-align: center; }
    .fp-score      { font-size: 13px; font-weight: 800; margin-bottom: 7px; }
    .fp-block      { border-radius: 9px 9px 0 0; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 900; color: #0F172A; }
    .fp-1          { width: 78px; height: 68px; background: #F59E0B; }
    .fp-2          { width: 70px; height: 52px; background: #94A3B8; }
    .fp-3          { width: 62px; height: 38px; background: #CD7C2E; }

    .lb-table      { width: 100%; border-collapse: collapse; }
    .lb-table th   { font-size: 9px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #475569; padding: 8px 13px; border-bottom: 1px solid #1E293B; text-align: left; }
    .lb-table th:last-child { text-align: right; }
    .lb-table td   { padding: 9px 13px; border-bottom: 1px solid #1E293B; vertical-align: middle; }
    .lb-table tr:last-child td { border-bottom: none; }
    .lb-row-top    { background: #1E293B; }
    .td-rank       { font-size: 15px; font-weight: 800; width: 34px; }
    .td-player     { display: flex; align-items: center; gap: 9px; }
    .td-av         { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 800; color: #0F172A; flex-shrink: 0; }
    .td-name       { font-size: 14px; font-weight: 600; color: #E2E8F0; }
    .td-score      { font-size: 14px; font-weight: 800; text-align: right; }
  `

  /* ─── PAGE 1: COVER ─────────────────────────────────────────────────── */
  const top3 = leaderboard.slice(0, 3)
  const podiumOrder = [
    { rank: 1, player: top3[1], block: 'podium-2nd', num: '2' },
    { rank: 0, player: top3[0], block: 'podium-1st', num: '1', crown: true },
    { rank: 2, player: top3[2], block: 'podium-3rd', num: '3' },
  ]
  const coverPodium = podiumOrder.map(({ rank, player, block, num, crown }) => {
    if (!player) return ''
    const rc = rankColor(rank)
    return `
    <div class="podium-slot">
      <span class="crown">${crown ? '&#128081;' : '&nbsp;'}</span>
      <div class="avatar" style="background:${rc}">${initials(player.name)}</div>
      <div class="podium-name">${player.name}</div>
      <div class="podium-score" style="color:${rc}">${fmt(player.score)}</div>
      <div class="podium-block ${block}">${num}</div>
    </div>`
  }).join('')

  const coverPage = `
  <div class="page">
    <div class="cover-blob blob-1"></div>
    <div class="cover-blob blob-2"></div>
    <div class="cover-blob blob-3"></div>
    <div class="stripe stripe-indigo"></div>
    <div class="cover-inner">
      <div class="cover-badge">&#9670; Quiz Results Report</div>
      <h1 class="cover-title">${quiz.title}</h1>
      <div class="cover-underline"></div>
      ${quiz.description ? `<p class="cover-desc">${quiz.description}</p>` : ''}
      <p class="cover-meta">${dateStr} &nbsp;&middot;&nbsp; Room: ${session.roomCode}</p>
      <div class="stat-grid">
        <div class="stat-card"><div class="val">${session.players.length}</div><div class="lbl">Participants</div></div>
        <div class="stat-card"><div class="val">${quiz.questions.length}</div><div class="lbl">Questions</div></div>
        <div class="stat-card"><div class="val" style="color:#10B981">${avgAccuracy}%</div><div class="lbl">Avg Accuracy</div></div>
        <div class="stat-card"><div class="val">${fmt(avgScore)}</div><div class="lbl">Avg Score</div></div>
      </div>
      <div class="podium-section">
        <div class="podium-title">&#127942; Top Performers</div>
        <div class="podium">${coverPodium}</div>
      </div>
    </div>
    ${footer(1)}
  </div>`

  /* ─── PAGE 2: SESSION OVERVIEW ──────────────────────────────────────── */
  const ovRows = questionStats.map((q) => `
    <div class="overview-row">
      <div class="ov-qlabel">Q${q.index + 1}</div>
      <div class="ov-qtext">${q.text}</div>
      <div class="ov-track">
        <div class="ov-fill ${fillClass(q.correctRate)}"
             style="width:${clamp(q.correctRate, q.correctRate > 0 ? 2 : 0, 100)}%"></div>
      </div>
      <div class="ov-pct" style="color:${pctColor(q.correctRate)}">${q.correctRate}%</div>
    </div>`).join('')

  const overviewPage = `
  <div class="page">
    <div class="stripe stripe-indigo"></div>
    <div class="page-inner">
      <div class="label">Session Overview</div>
      <div class="section-title">Question Accuracy</div>
      <div class="divider"></div>
      <div class="overview-bars">${ovRows}</div>
      <div class="summary-grid">
        <div class="summary-card"><div class="s-val">${session.players.length}</div><div class="s-lbl">Players</div></div>
        <div class="summary-card"><div class="s-val">${quiz.questions.length}</div><div class="s-lbl">Questions</div></div>
        <div class="summary-card"><div class="s-val" style="color:#10B981">${avgAccuracy}%</div><div class="s-lbl">Avg Accuracy</div></div>
        <div class="summary-card"><div class="s-val" style="color:#F59E0B">${fmt(leaderboard[0]?.score ?? 0)}</div><div class="s-lbl">Top Score</div></div>
      </div>
    </div>
    ${footer(2)}
  </div>`

  /* ─── QUESTION PAGES ────────────────────────────────────────────────── */
  const questionPages = questionStats.map((q, qi) => {
    const bc = badgeClass(q.correctRate)

    const optBars = q.options.map((opt, oi) => {
      const isC = oi === q.correctIndex
      const pct = q.percentages[oi]
      const fw  = clamp(pct, pct > 0 ? 2 : 0, 100)
      return `
      <div class="option-row">
        <div class="option-header">
          <div class="opt-letter ${isC ? 'opt-lc' : 'opt-lw'}">${LETTERS[oi]}</div>
          <div class="${isC ? 'opt-label-c' : 'opt-label-w'}">${opt}</div>
          <div class="opt-pct" style="color:${isC ? '#10B981' : '#64748B'}">${pct}%</div>
          <div class="opt-votes">${q.votes[oi]}v</div>
        </div>
        <div class="bar-track-q">
          <div class="${isC ? 'bar-fill-c' : 'bar-fill-w'}" style="width:${fw}%"></div>
        </div>
      </div>`
    }).join('')

    const miniRows = leaderboard.slice(0, 5).map((p, ri) => {
      const rc = rankColor(ri)
      return `
      <div class="mini-lb-row">
        <div class="mini-rank" style="color:${rc}">${ri + 1}</div>
        <div class="mini-avatar" style="background:${rc}">${initials(p.name)}</div>
        <div class="mini-name">${p.name}</div>
        <div class="mini-score" style="color:${rc}">${fmt(p.score)}</div>
      </div>`
    }).join('')

    return `
    <div class="page">
      <div class="stripe stripe-indigo"></div>
      <div class="q-page-inner">
        <div class="q-meta">
          <div class="q-num-badge">Question ${q.index + 1} of ${questionStats.length}</div>
          <div class="q-badge ${bc}">${q.correctRate}% Correct</div>
        </div>
        <div class="q-text">${q.text}</div>
        <div class="correct-pill">
          &#10003; Correct answer: <strong>${q.options[q.correctIndex]}</strong>
          &nbsp;&middot;&nbsp; ${q.total} responses
        </div>
        <div class="option-bars">${optBars}</div>
        <div class="mini-lb">
          <div class="mini-lb-title">Leaderboard at this point</div>
          <div class="mini-lb-rows">${miniRows}</div>
        </div>
      </div>
      ${footer(3 + qi)}
    </div>`
  }).join('')

  /* ─── FINAL LEADERBOARD PAGE ────────────────────────────────────────── */
  const fp3 = leaderboard.slice(0, 3)
  const fpOrder = [
    { rank: 1, player: fp3[1], block: 'fp-2', num: '2' },
    { rank: 0, player: fp3[0], block: 'fp-1', num: '1', crown: true },
    { rank: 2, player: fp3[2], block: 'fp-3', num: '3' },
  ]
  const fpHtml = fpOrder.map(({ rank, player, block, num, crown }) => {
    if (!player) return ''
    const rc = rankColor(rank)
    return `
    <div class="fp-slot">
      <span class="crown">${crown ? '&#128081;' : '&nbsp;'}</span>
      <div class="fp-avatar" style="background:${rc}">${initials(player.name)}</div>
      <div class="fp-name">${player.name}</div>
      <div class="fp-score" style="color:${rc}">${fmt(player.score)}</div>
      <div class="fp-block ${block}">${num}</div>
    </div>`
  }).join('')

  const tableRows = leaderboard.map((p, ri) => {
    const rc    = rankColor(ri)
    const isTop = ri < 3
    return `
    <tr ${isTop ? 'class="lb-row-top"' : ''}>
      <td class="td-rank" style="color:${rc}">${ri + 1}</td>
      <td>
        <div class="td-player">
          <div class="td-av" style="background:${rc}">${initials(p.name)}</div>
          <div class="td-name">${p.name}</div>
        </div>
      </td>
      <td class="td-score" style="color:${isTop ? rc : '#94A3B8'}">${fmt(p.score)}</td>
    </tr>`
  }).join('')

  const leaderboardPage = `
  <div class="page">
    <div class="stripe stripe-gold"></div>
    <div class="page-inner">
      <div class="label" style="color:#F59E0B">Final Results</div>
      <div class="section-title">Leaderboard</div>
      <div class="chips">
        <div class="chip">&#128218; ${quiz.questions.length} Questions</div>
        <div class="chip">&#128101; ${session.players.length} Players</div>
        <div class="chip">&#127919; ${avgAccuracy}% Avg Accuracy</div>
        <div class="chip">&#128197; ${dateStr}</div>
      </div>
      <div class="divider"></div>
      <div class="final-podium">${fpHtml}</div>
      <table class="lb-table">
        <thead><tr><th>#</th><th>Player</th><th>Score</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
    ${footer(totalPages)}
  </div>`

  /* ─── ASSEMBLE ──────────────────────────────────────────────────────── */
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${quiz.title} &mdash; Quiz Report</title>
  <style>${css}</style>
</head>
<body>
  ${coverPage}
  ${overviewPage}
  ${questionPages}
  ${leaderboardPage}
</body>
</html>`
}

module.exports = { generateSessionPDF }
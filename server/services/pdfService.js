const puppeteer = require('puppeteer')

/**
 * Generates a PDF report for a completed quiz session.
 * Structure mirrors Mentimeter's results export:
 *   Page 1 — Cover (quiz title, date, stats)
 *   Pages 2..N — One page per question (bar chart + correct answer)
 *   Last page — Final leaderboard
 */
async function generateSessionPDF(session, quiz) {
  const leaderboard = [...session.players]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)

  const questionStats = quiz.questions.map((q, i) => {
    const snapshot = session.voteSnapshots.find((v) => v.questionIndex === i)
    const votes = snapshot ? snapshot.votes : new Array(q.options.length).fill(0)
    const total = votes.reduce((a, b) => a + b, 0)
    const percentages = votes.map((v) => (total > 0 ? Math.round((v / total) * 100) : 0))
    return { ...q.toObject(), votes, total, percentages, index: i }
  })

  const html = buildHTML(session, quiz, questionStats, leaderboard)

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: 'new'
  })

  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'networkidle0' })

  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '0', bottom: '0', left: '0', right: '0' }
  })

  await browser.close()
  return pdf
}

function buildHTML(session, quiz, questionStats, leaderboard) {
  const date = session.startedAt
    ? new Date(session.startedAt).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      })
    : 'N/A'

  const questionPages = questionStats.map((q) => {
    const maxVotes = Math.max(...q.votes, 1)
    const bars = q.options.map((option, i) => {
      const isCorrect = i === q.correctIndex
      const barWidth = Math.round((q.votes[i] / maxVotes) * 100)
      return `
        <div class="bar-row">
          <div class="bar-label ${isCorrect ? 'correct-label' : ''}">${option}</div>
          <div class="bar-track">
            <div class="bar-fill ${isCorrect ? 'correct-bar' : ''}"
                 style="width: ${barWidth}%"></div>
          </div>
          <div class="bar-meta">
            <span class="votes">${q.votes[i]}</span>
            <span class="pct">${q.percentages[i]}%</span>
          </div>
        </div>
      `
    }).join('')

    const correctRate = q.total > 0
      ? Math.round((q.votes[q.correctIndex] / q.total) * 100)
      : 0

    return `
      <div class="page question-page">
        <div class="q-header">
          <span class="q-num">Question ${q.index + 1} of ${questionStats.length}</span>
          <span class="q-stat">${correctRate}% correct · ${q.total} responses</span>
        </div>
        <h2 class="q-text">${q.text}</h2>
        <div class="bars">${bars}</div>
        <div class="correct-tag">
          Correct answer: <strong>${q.options[q.correctIndex]}</strong>
        </div>
      </div>
    `
  }).join('')

  const leaderboardRows = leaderboard.map((p, i) => `
    <tr class="${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}">
      <td class="rank">${i + 1}</td>
      <td class="pname">${p.name}</td>
      <td class="score">${p.score.toLocaleString()}</td>
    </tr>
  `).join('')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }

  .page {
    width: 210mm;
    min-height: 297mm;
    padding: 48px 52px;
    page-break-after: always;
    display: flex;
    flex-direction: column;
  }

  /* Cover page */
  .cover { background: #1a1a2e; color: white; justify-content: center; gap: 24px; }
  .cover-badge { font-size: 12px; font-weight: 600; letter-spacing: .1em;
    text-transform: uppercase; color: #a78bfa; }
  .cover-title { font-size: 42px; font-weight: 700; line-height: 1.15; color: white; }
  .cover-date { font-size: 16px; color: #94a3b8; margin-top: 8px; }
  .cover-stats { display: flex; gap: 40px; margin-top: 32px; border-top: 1px solid #334155;
    padding-top: 32px; }
  .stat-block .stat-val { font-size: 36px; font-weight: 700; color: #a78bfa; }
  .stat-block .stat-label { font-size: 13px; color: #94a3b8; margin-top: 4px; }

  /* Question pages */
  .question-page { background: white; }
  .q-header { display: flex; justify-content: space-between; align-items: center;
    font-size: 12px; color: #64748b; margin-bottom: 24px; }
  .q-num { font-weight: 600; }
  .q-text { font-size: 26px; font-weight: 700; color: #0f172a;
    margin-bottom: 36px; line-height: 1.3; }
  .bars { display: flex; flex-direction: column; gap: 16px; flex: 1; }
  .bar-row { display: flex; align-items: center; gap: 12px; }
  .bar-label { width: 180px; font-size: 14px; color: #334155;
    font-weight: 500; flex-shrink: 0; }
  .correct-label { color: #059669; font-weight: 700; }
  .bar-track { flex: 1; height: 32px; background: #f1f5f9;
    border-radius: 6px; overflow: hidden; }
  .bar-fill { height: 100%; background: #6366f1; border-radius: 6px;
    transition: width .3s; min-width: 4px; }
  .correct-bar { background: #059669; }
  .bar-meta { display: flex; flex-direction: column; align-items: flex-end;
    width: 56px; flex-shrink: 0; }
  .votes { font-size: 14px; font-weight: 700; color: #0f172a; }
  .pct { font-size: 12px; color: #64748b; }
  .correct-tag { margin-top: 28px; padding: 12px 16px; background: #f0fdf4;
    border-left: 4px solid #059669; border-radius: 4px;
    font-size: 14px; color: #166534; }

  /* Leaderboard page */
  .leaderboard-page { background: #1a1a2e; color: white; }
  .lb-title { font-size: 32px; font-weight: 700; color: white; margin-bottom: 8px; }
  .lb-sub { font-size: 14px; color: #94a3b8; margin-bottom: 36px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 12px; font-weight: 600; color: #64748b;
    letter-spacing: .06em; text-transform: uppercase;
    padding: 10px 14px; border-bottom: 1px solid #1e293b; }
  td { padding: 14px; border-bottom: 1px solid #1e293b; }
  .rank { font-size: 18px; font-weight: 700; color: #475569; width: 48px; }
  .pname { font-size: 16px; font-weight: 600; color: #e2e8f0; }
  .score { font-size: 16px; font-weight: 700; color: #a78bfa; text-align: right; }
  .gold .rank { color: #fbbf24; }
  .gold .pname, .gold .score { color: #fbbf24; }
  .silver .rank { color: #94a3b8; }
  .bronze .rank { color: #b45309; }
</style>
</head>
<body>

<!-- Cover page -->
<div class="page cover">
  <div class="cover-badge">Quiz Results Report</div>
  <h1 class="cover-title">${quiz.title}</h1>
  <div class="cover-date">${date}</div>
  ${quiz.description ? `<p style="color:#94a3b8;font-size:15px;margin-top:8px">${quiz.description}</p>` : ''}
  <div class="cover-stats">
    <div class="stat-block">
      <div class="stat-val">${session.players.length}</div>
      <div class="stat-label">Participants</div>
    </div>
    <div class="stat-block">
      <div class="stat-val">${quiz.questions.length}</div>
      <div class="stat-label">Questions</div>
    </div>
    <div class="stat-block">
      <div class="stat-val">${
        session.players.length > 0
          ? Math.round(
              session.players.reduce((a, p) => a + p.score, 0) /
                session.players.length
            ).toLocaleString()
          : 0
      }</div>
      <div class="stat-label">Avg score</div>
    </div>
    <div class="stat-block">
      <div class="stat-val">${session.roomCode}</div>
      <div class="stat-label">Room code</div>
    </div>
  </div>
</div>

<!-- One page per question -->
${questionPages}

<!-- Final leaderboard page -->
<div class="page leaderboard-page">
  <div class="lb-title">Final leaderboard</div>
  <div class="lb-sub">Top ${leaderboard.length} players</div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Player</th>
        <th style="text-align:right">Score</th>
      </tr>
    </thead>
    <tbody>${leaderboardRows}</tbody>
  </table>
</div>

</body>
</html>`
}

module.exports = { generateSessionPDF }
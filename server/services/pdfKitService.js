/**
 * QuizPulse — PDFKit Fallback PDF Service
 *
 * Mirrors the Puppeteer layout as closely as PDFKit allows:
 *   Page 1  — Cover    : brand bar, title, date/room, 4 stat boxes, top-3 podium
 *   Page 2  — Overview : accuracy bar per question, summary chips
 *   Page 3…N— Questions: one per page, bar chart + answer label
 *   Last    — Leaderboard: podium + full ranked list
 *
 * Install:  npm install pdfkit
 */

const PDFDocument = require('pdfkit')

// ─── Palette (matches pdfService.js) ────────────────────────────────────────
const C = {
  purple:  '#7C6AF7',
  teal:    '#4FC4CF',
  orange:  '#FF8C69',
  green:   '#059669',
  greenBg: '#ECFDF5',
  amber:   '#F59E0B',
  silver:  '#9CA3AF',
  bronze:  '#CD7C2E',
  dark:    '#111827',
  mid:     '#374151',
  muted:   '#6B7280',
  hint:    '#9CA3AF',
  border:  '#F3F4F6',
  surface: '#FAFAFA',
  white:   '#FFFFFF',
  barColors: ['#7C6AF7', '#4FC4CF', '#FF8C69', '#FFB347', '#69C369', '#FF6B9D'],
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']
const MEDALS  = ['1st', '2nd', '3rd']

// A4 dimensions in points (72pt = 1 inch)
const W  = 595.28
const H  = 841.89
const ML = 48       // margin left
const MR = 48       // margin right
const CW = W - ML - MR  // content width

const fmt    = (n) => Number(n).toLocaleString('en-US')
const initials = (name = '') => name.trim().slice(0, 2).toUpperCase()
const clamp  = (v, lo, hi) => Math.min(Math.max(v, lo), hi)

// ─── Shared drawing helpers ──────────────────────────────────────────────────

function brandBar(doc) {
  // Gradient simulation: 3 colour blocks side by side
  const bh = 6
  doc.rect(0, 0, W / 3, bh).fill(C.purple)
  doc.rect(W / 3, 0, W / 3, bh).fill(C.teal)
  doc.rect((W / 3) * 2, 0, W / 3, bh).fill(C.orange)
}

function pageHeader(doc, quizTitle, rightText) {
  const y = 22
  doc.fontSize(11).font('Helvetica-Bold').fillColor(C.purple).text('QuizPulse', ML, y)
  doc.fontSize(10).font('Helvetica').fillColor(C.hint)
     .text(`${quizTitle}  |  ${rightText}`, ML, y, { align: 'right', width: CW })
  doc.moveTo(ML, y + 16).lineTo(W - MR, y + 16).strokeColor(C.border).lineWidth(0.5).stroke()
}

function pageFooter(doc, pageNum, totalPages, quizTitle, currentY) {
  const fy = H - 28
  doc.moveTo(ML, fy - 6).lineTo(W - MR, fy - 6).strokeColor(C.border).lineWidth(0.5).stroke()
  doc.fontSize(9).font('Helvetica').fillColor(C.hint)
  doc.text(`QuizPulse — ${quizTitle}`, ML, fy, { continued: false })
  doc.text(`Page ${pageNum} of ${totalPages}`, ML, fy, { align: 'right', width: CW })
}

function roundedRect(doc, x, y, w, h, r, fillColor, strokeColor) {
  doc.roundedRect(x, y, w, h, r)
  if (fillColor)  doc.fill(fillColor)
  if (strokeColor) doc.roundedRect(x, y, w, h, r).strokeColor(strokeColor).lineWidth(1).stroke()
}

// ─── Page 1: Cover ──────────────────────────────────────────────────────────

function drawCover(doc, { session, quiz, avgAccuracy, avgScore, dateStr, timeStr, leaderboard }) {
  brandBar(doc)

  let y = 52

  // Eyebrow pill
  const eyebrowText = 'Quiz Results Report'
  const eyebrowW = 160
  roundedRect(doc, ML, y, eyebrowW, 22, 11, '#F5F3FF', null)
  doc.fontSize(10).font('Helvetica-Bold').fillColor(C.purple)
     .text(eyebrowText, ML, y + 6, { width: eyebrowW, align: 'center' })
  y += 34

  // Title
  doc.fontSize(36).font('Helvetica-Bold').fillColor(C.dark)
     .text(quiz.title, ML, y, { width: CW, lineGap: 2 })
  y += doc.heightOfString(quiz.title, { fontSize: 36, width: CW }) + 8

  // Meta row
  doc.fontSize(11).font('Helvetica').fillColor(C.muted)
  const metaParts = [
    `${dateStr}${timeStr ? ' at ' + timeStr : ''}`,
    `Room ${session.roomCode}`,
    quiz.description || null,
  ].filter(Boolean)
  doc.text(metaParts.join('   |   '), ML, y, { width: CW })
  y += 28

  // 4 stat pills
  const pillW = (CW - 36) / 4
  const pillH = 72
  const statColors = [C.purple, C.dark, C.teal, C.orange]
  const stats = [
    { val: session.players.length, lbl: 'Participants' },
    { val: quiz.questions.length,  lbl: 'Questions' },
    { val: `${avgAccuracy}%`,      lbl: 'Avg Accuracy' },
    { val: fmt(avgScore),          lbl: 'Avg Score' },
  ]
  stats.forEach((s, i) => {
    const px = ML + i * (pillW + 12)
    roundedRect(doc, px, y, pillW, pillH, 12, C.surface, C.border)
    doc.fontSize(28).font('Helvetica-Bold').fillColor(statColors[i])
       .text(String(s.val), px + 8, y + 12, { width: pillW - 16, align: 'left' })
    doc.fontSize(9).font('Helvetica-Bold').fillColor(C.hint)
       .text(s.lbl.toUpperCase(), px + 8, y + 46, { width: pillW - 16 })
  })
  y += pillH + 24

  // Podium card
  const cardH = 170
  roundedRect(doc, ML, y, CW, cardH, 16, C.surface, C.border)
  doc.fontSize(9).font('Helvetica-Bold').fillColor(C.hint)
     .text('TOP PERFORMERS', ML + 16, y + 14)

  drawPodium(doc, leaderboard.slice(0, 3), ML + 16, y + 30, CW - 32, 130)
}

function drawPodium(doc, top3, x, y, w, maxH) {
  if (top3.length === 0) return

  const slotW = w / 3
  // Order: 2nd, 1st, 3rd
  const order = [1, 0, 2]
  const blockHeights = [50, 68, 36]
  const blockColors  = [C.silver, C.amber, C.bronze]
  const scoreColors  = [C.silver, C.amber, C.bronze]
  const labels = ['2', '1', '3']
  const crowns = [false, true, false]

  order.forEach((playerIdx, slotIdx) => {
    const p = top3[playerIdx]
    if (!p) return

    const sx = x + slotIdx * slotW + slotW / 2
    const bh = blockHeights[slotIdx]
    const by = y + maxH - bh

    // Crown for 1st
    if (crowns[slotIdx]) {
      const cx = sx - 10
      const cy = by - 72
      // Draw a simple 3-pointed crown shape
      doc.save()
         .moveTo(cx, cy + 8)
         .lineTo(cx, cy)
         .lineTo(cx + 5, cy + 4)
         .lineTo(cx + 10, cy)
         .lineTo(cx + 15, cy + 4)
         .lineTo(cx + 20, cy)
         .lineTo(cx + 20, cy + 8)
         .closePath()
         .fill(C.amber)
         .restore()
    }

    // Avatar circle
    roundedRect(doc, sx - 18, by - 60, 36, 36, 18, blockColors[slotIdx], null)
    doc.fontSize(11).font('Helvetica-Bold').fillColor(C.white)
       .text(initials(p.name), sx - 18, by - 53, { width: 36, align: 'center' })

    // Name
    doc.fontSize(9).font('Helvetica-Bold').fillColor(C.mid)
       .text(p.name.slice(0, 12), sx - slotW / 2 + 4, by - 20, { width: slotW - 8, align: 'center' })

    // Score
    doc.fontSize(11).font('Helvetica-Bold').fillColor(scoreColors[slotIdx])
       .text(fmt(p.score), sx - slotW / 2 + 4, by - 8, { width: slotW - 8, align: 'center' })

    // Podium block
    roundedRect(doc, sx - 34, by, 68, bh, 0, blockColors[slotIdx], null)
    doc.fontSize(18).font('Helvetica-Bold').fillColor('rgba(0,0,0,0.2)')
       .text(labels[slotIdx], sx - 34, by + (bh / 2) - 10, { width: 68, align: 'center' })
  })
}

// ─── Page 2: Overview ───────────────────────────────────────────────────────

function drawOverview(doc, { quiz, questionStats, session, avgAccuracy, dateStr }) {
  brandBar(doc)
  pageHeader(doc, quiz.title, dateStr)

  let y = 60

  // Section heading
  doc.fontSize(10).font('Helvetica-Bold').fillColor(C.purple).text('SESSION OVERVIEW', ML, y)
  y += 16
  doc.fontSize(22).font('Helvetica-Bold').fillColor(C.dark).text('Question Accuracy', ML, y)
  y += 28
  doc.fontSize(11).font('Helvetica').fillColor(C.muted)
     .text('How well participants answered each question', ML, y)
  y += 24

  const barTrackW = CW - 200  // leave room for num, label, pct
  const rowH = 28

  questionStats.forEach((q) => {
    const pct = q.correctRate
    const fillColor = pct >= 60 ? C.teal : pct >= 30 ? '#FFB347' : C.orange

    // Q number box
    roundedRect(doc, ML, y, 28, 22, 6, '#F5F3FF', null)
    doc.fontSize(9).font('Helvetica-Bold').fillColor(C.purple)
       .text(`Q${q.index + 1}`, ML, y + 7, { width: 28, align: 'center' })

    // Question text (truncated)
    const labelText = q.text.length > 28 ? q.text.slice(0, 28) + '…' : q.text
    doc.fontSize(10).font('Helvetica-Bold').fillColor(C.mid)
       .text(labelText, ML + 36, y + 7, { width: 130 })

    // Bar track
    const bx = ML + 174
    roundedRect(doc, bx, y + 7, barTrackW, 10, 5, C.border, null)
    if (pct > 0) {
      const fillW = clamp((pct / 100) * barTrackW, 4, barTrackW)
      roundedRect(doc, bx, y + 7, fillW, 10, 5, fillColor, null)
    }

    // Percentage
    doc.fontSize(11).font('Helvetica-Bold').fillColor(fillColor)
       .text(`${pct}%`, bx + barTrackW + 8, y + 5, { width: 36, align: 'right' })

    y += rowH
  })

  // Divider
  y += 8
  doc.moveTo(ML, y).lineTo(W - MR, y).strokeColor(C.border).lineWidth(0.5).stroke()
  y += 16

  // Summary chips
  const chips = [
    `${session.players.length} participants`,
    `${quiz.questions.length} questions`,
    `${avgAccuracy}% avg accuracy`,
  ]
  let cx = ML
  chips.forEach((chip) => {
    const cw = doc.widthOfString(chip, { fontSize: 10 }) + 24
    roundedRect(doc, cx, y, cw, 22, 11, '#F9FAFB', C.border)
    doc.fontSize(10).font('Helvetica').fillColor(C.mid).text(chip, cx + 12, y + 7)
    cx += cw + 8
  })
}

// ─── Pages 3…N: Per-question ─────────────────────────────────────────────────

function drawQuestion(doc, { q, quiz, questionStats, pageNum, totalPages }) {
  brandBar(doc)
  pageHeader(doc, quiz.title, `Question ${q.index + 1} of ${questionStats.length}`)

  let y = 60

  // Progress bar
  const progressPct = Math.round(((q.index + 1) / questionStats.length) * 100)
  doc.fontSize(9).font('Helvetica-Bold').fillColor(C.hint).text('PROGRESS', ML, y)
  const pbx = ML + 60
  const pbw = CW - 100
  roundedRect(doc, pbx, y, pbw, 5, 2, C.border, null)
  if (progressPct > 0) {
    roundedRect(doc, pbx, y, clamp((progressPct / 100) * pbw, 4, pbw), 5, 2, C.purple, null)
  }
  doc.fontSize(9).font('Helvetica-Bold').fillColor(C.purple)
     .text(`${progressPct}%`, pbx + pbw + 6, y - 1, { width: 30, align: 'right' })
  y += 18

  // Divider
  doc.moveTo(ML, y).lineTo(W - MR, y).strokeColor(C.border).lineWidth(0.5).stroke()
  y += 16

  // Question text
  doc.fontSize(20).font('Helvetica-Bold').fillColor(C.dark)
     .text(q.text, ML, y, { width: CW, lineGap: 2 })
  y += doc.heightOfString(q.text, { fontSize: 20, width: CW }) + 8

  // Response count
  doc.fontSize(11).font('Helvetica').fillColor(C.hint)
     .text(`${q.total} response${q.total !== 1 ? 's' : ''}`, ML, y)
  y += 20

  // Correct answer tag
  const tagText = `Correct answer: ${q.options[q.correctIndex]}  |  ${q.correctRate}% got it right`
  const tagW = Math.min(doc.widthOfString(tagText, { fontSize: 10 }) + 28, CW)
  roundedRect(doc, ML, y, tagW, 24, 12, C.greenBg, '#A7F3D0')
  doc.fontSize(10).font('Helvetica-Bold').fillColor(C.green)
     .text(tagText, ML + 14, y + 8, { width: tagW - 28 })
  y += 36

  // Option bars
  const barTrackW = CW - 80  // room for letter badge + pct + votes
  const optRowH   = 44

  q.options.forEach((opt, oi) => {
    const isCorrect = oi === q.correctIndex
    const pct = q.percentages[oi] ?? 0
    const barColor = isCorrect ? C.teal : C.barColors[oi % C.barColors.length]

    // Letter badge
    roundedRect(doc, ML, y + 2, 22, 22, 5,
      isCorrect ? '#D1FAE5' : C.border, null)
    doc.fontSize(9).font('Helvetica-Bold')
       .fillColor(isCorrect ? C.green : C.hint)
       .text(LETTERS[oi], ML, y + 9, { width: 22, align: 'center' })

    // Option text
    doc.fontSize(11)
       .font(isCorrect ? 'Helvetica-Bold' : 'Helvetica')
       .fillColor(isCorrect ? C.green : C.mid)
       .text(opt, ML + 30, y + 8, { width: CW - 130 })

    // Pct + votes (right-aligned)
    doc.fontSize(11).font('Helvetica-Bold').fillColor(C.dark)
       .text(`${pct}%`, W - MR - 90, y + 8, { width: 40, align: 'right' })
    doc.fontSize(9).font('Helvetica').fillColor(C.hint)
       .text(`${q.votes[oi]} votes`, W - MR - 46, y + 9, { width: 46, align: 'right' })

    // Bar track
    const bx = ML + 30
    const bw = CW - 130
    roundedRect(doc, bx, y + 26, bw, 12, 6, C.border, null)
    if (pct > 0) {
      const fillW = clamp((pct / 100) * bw, 4, bw)
      roundedRect(doc, bx, y + 26, fillW, 12, 6,
        isCorrect ? C.teal : barColor + '99', null)
    }

    y += optRowH
  })
}

// ─── Last page: Leaderboard ──────────────────────────────────────────────────

function drawLeaderboard(doc, { quiz, session, leaderboard, dateStr, totalPages }) {
  brandBar(doc)
  pageHeader(doc, quiz.title, dateStr)

  let y = 60

  doc.fontSize(10).font('Helvetica-Bold').fillColor(C.purple).text('FINAL RESULTS', ML, y)
  y += 16
  doc.fontSize(22).font('Helvetica-Bold').fillColor(C.dark).text('Leaderboard', ML, y)
  y += 28
  doc.fontSize(11).font('Helvetica').fillColor(C.muted)
     .text(`${leaderboard.length} participants  |  ${quiz.questions.length} questions  |  Room ${session.roomCode}`, ML, y)
  y += 24

  // Podium top 3
  if (leaderboard.length >= 2) {
    drawPodium(doc, leaderboard.slice(0, 3), ML, y, CW, 140)
    y += 158
    doc.moveTo(ML, y).lineTo(W - MR, y).strokeColor(C.border).lineWidth(0.5).stroke()
    y += 12
  }

  // Full ranked list
  const topScore = leaderboard[0]?.score || 1
  const rowH = 30

  leaderboard.forEach((p, ri) => {
    if (y + rowH > H - 48) return  // don't overflow page (future: multi-page lb)

    const isTop3 = ri < 3
    if (isTop3) {
      roundedRect(doc, ML, y, CW, rowH - 2, 8, '#FFFBEB', null)
    } else if (ri % 2 === 1) {
      roundedRect(doc, ML, y, CW, rowH - 2, 8, C.surface, null)
    }

    // Rank medal or number
    const rankColor = [C.amber, C.silver, C.bronze][ri] ?? C.muted
    const rankText  = ri < 3 ? ['#1', '#2', '#3'][ri] : `#${ri + 1}`
    doc.fontSize(12).font('Helvetica-Bold').fillColor(rankColor)
       .text(rankText, ML + 8, y + 9, { width: 28 })

    // Avatar circle
    const avColor = [C.amber, C.silver, C.bronze][ri] ?? C.purple
    roundedRect(doc, ML + 40, y + 3, 24, 24, 12, avColor, null)
    doc.fontSize(8).font('Helvetica-Bold').fillColor(C.white)
       .text(initials(p.name), ML + 40, y + 10, { width: 24, align: 'center' })

    // Name
    doc.fontSize(11).font('Helvetica-Bold').fillColor(C.dark)
       .text(p.name, ML + 72, y + 9, { width: CW - 200 })

    // Score bar
    const bx = W - MR - 160
    const bw = 100
    const barPct = Math.round((p.score / topScore) * 100)
    roundedRect(doc, bx, y + 11, bw, 7, 3, C.border, null)
    if (barPct > 0) {
      roundedRect(doc, bx, y + 11, clamp((barPct / 100) * bw, 4, bw), 7, 3, C.purple, null)
    }

    // Score value
    doc.fontSize(11).font('Helvetica-Bold').fillColor(C.dark)
       .text(fmt(p.score), bx + bw + 8, y + 9, { width: 52, align: 'right' })

    y += rowH
  })
}

// ─── Main export ─────────────────────────────────────────────────────────────

async function generateFallbackPDF(session, quiz) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true })
      const chunks = []
      doc.on('data',  (chunk) => chunks.push(chunk))
      doc.on('end',   () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      // ── Shared data (mirrors pdfService.js generateSessionPDF) ──────────
      const leaderboard = [...session.players].sort((a, b) => b.score - a.score)

      // O(n) Map lookup instead of O(n²) nested .find()
      const snapshotMap = new Map(
        session.voteSnapshots.map(v => [v.questionIndex, v])
      )

      const questionStats = quiz.questions.map((q, i) => {
        const snap = snapshotMap.get(i)
        const votes = snap ? snap.votes : new Array(q.options.length).fill(0)
        const total = votes.reduce((a, b) => a + b, 0)
        const percentages = votes.map((v) => (total > 0 ? Math.round((v / total) * 100) : 0))
        const correctRate = percentages[q.correctIndex] ?? 0
        const qObj = typeof q.toObject === 'function' ? q.toObject() : q
        return { ...qObj, votes, total, percentages, correctRate, index: i }
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

      const totalPages = 1 + 1 + questionStats.length + 1
      const ctx = { session, quiz, questionStats, leaderboard, avgAccuracy, avgScore, dateStr, timeStr, totalPages }

      // ── Page 1: Cover ────────────────────────────────────────────────────
      drawCover(doc, ctx)
      pageFooter(doc, 1, totalPages, quiz.title)

      // ── Page 2: Overview ─────────────────────────────────────────────────
      doc.addPage()
      drawOverview(doc, ctx)
      pageFooter(doc, 2, totalPages, quiz.title)

      // ── Pages 3…N: Questions ─────────────────────────────────────────────
      questionStats.forEach((q, qi) => {
        doc.addPage()
        drawQuestion(doc, { q, quiz, questionStats, pageNum: 3 + qi, totalPages })
        pageFooter(doc, 3 + qi, totalPages, quiz.title)
      })

      // ── Last page: Leaderboard ───────────────────────────────────────────
      doc.addPage()
      drawLeaderboard(doc, { ...ctx, totalPages })
      pageFooter(doc, totalPages, totalPages, quiz.title)

      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

module.exports = { generateFallbackPDF }
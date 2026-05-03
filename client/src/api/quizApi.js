import axios from 'axios'
import { getToken } from '../hooks/useAuth'

const BASE = import.meta.env.VITE_SERVER_URL || ''

function authHeader() {
  return { Authorization: `Bearer ${getToken()}` }
}

// ─── Auth ──────────────────────────────────────────
export async function register(name, email, password) {
  const { data } = await axios.post(`${BASE}/api/auth/register`, { name, email, password })
  return data   // { token, user }
}

export async function login(email, password) {
  const { data } = await axios.post(`${BASE}/api/auth/login`, { email, password })
  return data   // { token, user }
}

export async function getMe() {
  const { data } = await axios.get(`${BASE}/api/auth/me`, { headers: authHeader() })
  return data   // { user }
}

// ─── Quiz CRUD ─────────────────────────────────────
export async function getQuizzes() {
  const { data } = await axios.get(`${BASE}/api/quiz`, { headers: authHeader() })
  return data   // { quizzes: [...] }
}

export async function getQuiz(id) {
  const { data } = await axios.get(`${BASE}/api/quiz/${id}`, { headers: authHeader() })
  return data   // { quiz }
}

export async function createQuiz(payload) {
  // payload = { title, description, questions }
  const { data } = await axios.post(`${BASE}/api/quiz`, payload, { headers: authHeader() })
  return data   // { quiz }
}

export async function updateQuiz(id, payload) {
  const { data } = await axios.put(`${BASE}/api/quiz/${id}`, payload, { headers: authHeader() })
  return data   // { quiz }
}

export async function deleteQuiz(id) {
  const { data } = await axios.delete(`${BASE}/api/quiz/${id}`, { headers: authHeader() })
  return data   // { message: 'Quiz deleted' }
}

// ─── Session ───────────────────────────────────────
export async function createSession(quizId) {
  const { data } = await axios.post(`${BASE}/api/quiz/${quizId}/session`, {}, { headers: authHeader() })
  return data   // { sessionId, roomCode }
}

export async function validateRoom(roomCode) {
  const { data } = await axios.get(`${BASE}/api/session/${roomCode}`)
  return data   // { sessionId, roomCode, status, quizTitle, totalQuestions, playerCount }
}

export async function verifyHostSession(roomCode) {
  // Returns { ok: true, status } if the logged-in user owns this session.
  // Throws with response.status 403 if they don't, 404 if not found.
  const { data } = await axios.get(`${BASE}/api/session/${roomCode}/verify-host`, { headers: authHeader() })
  return data
}

export async function getSessionHistory() {
  const { data } = await axios.get(`${BASE}/api/session/history`, { headers: authHeader() })
  return data   // { sessions: [...] }
}

export async function deleteSession(sessionId) {
  const { data } = await axios.delete(`${BASE}/api/session/${sessionId}`, { headers: authHeader() })
  return data   // { message: 'Session deleted' }
}

export async function getSessionResults(sessionId) {
  const { data } = await axios.get(`${BASE}/api/session/${sessionId}/results`, { headers: authHeader() })
  return data   // { session, leaderboard, questionStats }
}

// ─── Export ────────────────────────────────────────

// Helper: trigger browser download for a blob
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')

  a.href = url
  a.download = filename

  document.body.appendChild(a)
  a.click()
  a.remove()

  URL.revokeObjectURL(url)
}

// Fallback PDF generation
async function handlePdfFallback(sessionId, filename) {
  const choice = window.confirm(
    "High-quality PDF failed.\n\nOK → Generate simple PDF\nCancel → Retry"
  )

  if (choice) {
    return downloadSimplePdf(sessionId, filename)
  } else {
    return exportSessionPdf(sessionId, filename) // retry
  }
}

// export session PDF (high-quality)
export async function exportSessionPdf(sessionId, filename = 'quiz-results.pdf') {
  const response = await fetch(`${BASE}/api/export/${sessionId}`, {
    headers: { Authorization: `Bearer ${getToken()}` }
  })

  if (response.ok) {
    const blob = await response.blob()
    return downloadBlob(blob, filename)
  }

  const err = await response.json().catch(() => ({}))
  // SPECIAL CASE → fallback flow
  if (err.error === 'pdf_quality_failed' && err.fallbackAvailable) {
    return handlePdfFallback(sessionId, filename)
  }
  throw new Error(err.error || 'Failed to export PDF') // NORMAL ERROR
}

// export session PDF (simple & fast) 
async function downloadSimplePdf(sessionId, filename) {
  const response = await fetch(`${BASE}/api/export/${sessionId}/simple`, {
    headers: { Authorization: `Bearer ${getToken()}` }
  })

  if (!response.ok) {
    throw new Error('Failed to generate simple PDF')
  }

  const blob = await response.blob()
  downloadBlob(blob, filename.replace('.pdf', '-simple.pdf'))
}
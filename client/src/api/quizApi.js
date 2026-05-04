// client/src/api/quizApi.js  (full replacement)

import axios from 'axios'

const BASE = import.meta.env.VITE_SERVER_URL || ''

// All axios calls include credentials so the browser sends the httpOnly cookie.
// The Authorization header is gone — the cookie replaces it.
const api = axios.create({
  baseURL:         BASE,
  withCredentials: true,   // ← this is the key change
})

// ─── Auth ──────────────────────────────────────────────────────────
export async function register(name, email, password) {
  const { data } = await api.post('/api/auth/register', { name, email, password })
  return data   // { user }
}

export async function login(email, password) {
  const { data } = await api.post('/api/auth/login', { email, password })
  return data   // { user }
}

export async function logout() {
  await api.post('/api/auth/logout')
}

export async function getMe() {
  const { data } = await api.get('/api/auth/me')
  return data   // { user }
}

// ─── Quiz CRUD ─────────────────────────────────────────────────────
// All headers() calls are gone — cookie is automatic.

export async function getQuizzes() {
  const { data } = await api.get('/api/quiz')
  return data
}

export async function getQuiz(id) {
  const { data } = await api.get(`/api/quiz/${id}`)
  return data
}

export async function createQuiz(payload) {
  const { data } = await api.post('/api/quiz', payload)
  return data
}

export async function updateQuiz(id, payload) {
  const { data } = await api.put(`/api/quiz/${id}`, payload)
  return data
}

export async function deleteQuiz(id) {
  const { data } = await api.delete(`/api/quiz/${id}`)
  return data
}

// ─── Session ────────────────────────────────────────────────────────
export async function createSession(quizId) {
  const { data } = await api.post(`/api/quiz/${quizId}/session`, {})
  return data
}

export async function validateRoom(roomCode) {
  const { data } = await api.get(`/api/session/${roomCode}`)
  return data
}

export async function verifyHostSession(roomCode) {
  const { data } = await api.get(`/api/session/${roomCode}/verify-host`)
  return data
}

export async function getSessionHistory() {
  const { data } = await api.get('/api/session/history')
  return data
}

export async function deleteSession(sessionId) {
  const { data } = await api.delete(`/api/session/${sessionId}`)
  return data
}

export async function getSessionResults(sessionId) {
  const { data } = await api.get(`/api/session/${sessionId}/results`)
  return data
}

// ─── Export ─────────────────────────────────────────────────────────
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function exportSessionPdf(sessionId, filename = 'quiz-results.pdf') {
  // fetch() doesn't use the axios instance, so pass credentials manually
  const response = await fetch(`${BASE}/api/export/${sessionId}`, {
    credentials: 'include',    // ← replaces the old Authorization header
  })

  if (response.ok) {
    const blob = await response.blob()
    return downloadBlob(blob, filename)
  }

  const err = await response.json().catch(() => ({}))
  if (err.error === 'pdf_quality_failed' && err.fallbackAvailable) {
    return handlePdfFallback(sessionId, filename)
  }
  throw new Error(err.error || 'Failed to export PDF')
}

async function handlePdfFallback(sessionId, filename) {
  const choice = window.confirm(
    'High-quality PDF failed.\n\nOK → Generate simple PDF\nCancel → Retry'
  )
  return choice
    ? downloadSimplePdf(sessionId, filename)
    : exportSessionPdf(sessionId, filename)
}

async function downloadSimplePdf(sessionId, filename) {
  const response = await fetch(`${BASE}/api/export/${sessionId}/simple`, {
    credentials: 'include',
  })
  if (!response.ok) throw new Error('Failed to generate simple PDF')
  const blob = await response.blob()
  downloadBlob(blob, filename.replace('.pdf', '-simple.pdf'))
}
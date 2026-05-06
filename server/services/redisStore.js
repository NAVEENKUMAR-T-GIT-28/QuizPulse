/**
 * redisStore.js
 *
 * High-level helpers that replace the six process-local Maps in quizSocket.js:
 *
 *   liveVotes      → Redis hash  quizpulse:votes:{roomCode}          (JSON per key)
 *   roomHosts      → Redis hash  quizpulse:hosts                     (roomCode → socketId)
 *   roomTimers     → NOT stored in Redis — timers must run in the process
 *                    that owns the connection. Each process manages its own
 *                    timer; only the timer metadata (timeLimit, startedAt) is
 *                    stored in Redis so a recovering process can re-arm the timer.
 *   roomIntervals  → same as roomTimers — process-local only
 *   lastAnswerTime → Redis string quizpulse:throttle:{socketId}      (EX 1s)
 *   roomEnded      → Redis string quizpulse:ended:{roomCode}         (EX 10s)
 *
 * All keys get a TTL so they self-expire if cleanup() is never called (e.g. crash).
 *
 * KEY DESIGN
 *   quizpulse:votes:{ROOMCODE}          hash  { "{qIndex}": "[v0,v1,…]" }
 *   quizpulse:hosts                     hash  { "{ROOMCODE}": "{socketId}" }
 *   quizpulse:throttle:{socketId}       string "1"  EX 1
 *   quizpulse:ended:{ROOMCODE}          string "1"  EX 10
 *   quizpulse:timer:{ROOMCODE}          hash  { timeLimit, startedAt, questionIndex }
 *
 * TTLs
 *   votes / timer metadata : SESSION_TTL_SECS (4 h) — matches typical quiz length + buffer
 *   hosts                  : no TTL — cleaned up explicitly at session end / cancel
 *   throttle               : 1 s
 *   ended flag             : 10 s
 */

'use strict'

const redis = require('./redisClient')

const SESSION_TTL_SECS = 4 * 60 * 60   // 4 hours

// ─── Key helpers ─────────────────────────────────────────────────────────────
const k = {
  votes   : (code)     => `quizpulse:votes:${code}`,
  hosts   : ()         => 'quizpulse:hosts',
  throttle: (socketId) => `quizpulse:throttle:${socketId}`,
  ended   : (code)     => `quizpulse:ended:${code}`,
  timer   : (code)     => `quizpulse:timer:${code}`,
}

// ─── liveVotes ────────────────────────────────────────────────────────────────

/**
 * Initialize vote counts for a question.
 * @param {string} code - Room code (uppercase)
 * @param {number} questionIndex
 * @param {number} optionCount
 */
async function initVotes(code, questionIndex, optionCount) {
  const votes = new Array(optionCount).fill(0)
  await redis.hset(k.votes(code), String(questionIndex), JSON.stringify(votes))
  await redis.expire(k.votes(code), SESSION_TTL_SECS)
}

/**
 * Increment a single option's vote count atomically-ish.
 * Returns the updated votes array.
 * @param {string} code
 * @param {number} questionIndex
 * @param {number} optionIndex
 * @param {number} optionCount - Used to initialise if key is missing
 * @returns {number[]}
 */
async function incrementVote(code, questionIndex, optionIndex, optionCount) {
  const raw = await redis.hget(k.votes(code), String(questionIndex))
  const votes = raw ? JSON.parse(raw) : new Array(optionCount).fill(0)
  votes[optionIndex] = (votes[optionIndex] || 0) + 1
  await redis.hset(k.votes(code), String(questionIndex), JSON.stringify(votes))
  await redis.expire(k.votes(code), SESSION_TTL_SECS)
  return votes
}

/**
 * Get votes for a specific question.
 * @returns {number[] | null}
 */
async function getVotes(code, questionIndex) {
  const raw = await redis.hget(k.votes(code), String(questionIndex))
  return raw ? JSON.parse(raw) : null
}

/**
 * Delete all vote data for a room.
 */
async function deleteVotes(code) {
  await redis.del(k.votes(code))
}

// ─── roomHosts ────────────────────────────────────────────────────────────────

/**
 * Register the host's current socket ID for a room.
 */
async function setHost(code, socketId) {
  await redis.hset(k.hosts(), code, socketId)
}

/**
 * Get the host's socket ID for a room.
 * @returns {string | null}
 */
async function getHost(code) {
  return redis.hget(k.hosts(), code)
}

/**
 * Remove the host entry for a room.
 */
async function deleteHost(code) {
  await redis.hdel(k.hosts(), code)
}

// ─── lastAnswerTime (throttle) ────────────────────────────────────────────────

/**
 * Check if a socket is currently throttled (answered within the last 500 ms).
 * Sets the throttle flag if not already set.
 * @returns {boolean} true = throttled, skip this answer
 */
async function checkAndSetThrottle(socketId) {
  // SET NX EX 1 is atomic — only one call wins the 1-second window
  // ioredis: set(key, val, 'EX', ttl, 'NX') returns 'OK' or null
  const result = await redis.set(k.throttle(socketId), '1', 'EX', 1, 'NX')
  return result === null   // null means the key already existed → throttled
}

/**
 * Remove the throttle flag for a socket (on disconnect).
 */
async function deleteThrottle(socketId) {
  await redis.del(k.throttle(socketId))
}

// ─── roomEnded ────────────────────────────────────────────────────────────────

/**
 * Mark a room as ended. Auto-expires after 10 s to cover in-flight callbacks.
 */
async function setRoomEnded(code) {
  await redis.set(k.ended(code), '1', 'EX', 10)
}

/**
 * @returns {boolean}
 */
async function isRoomEnded(code) {
  const v = await redis.get(k.ended(code))
  return v === '1'
}

/**
 * Remove the ended flag (called when a new question starts, resetting state).
 */
async function clearRoomEnded(code) {
  await redis.del(k.ended(code))
}

// ─── Timer metadata ───────────────────────────────────────────────────────────
// We store enough metadata so that if the process handling the room restarts,
// a reconnecting host can re-arm the countdown from the correct remaining time.

/**
 * Persist timer metadata at the start of each question.
 * @param {string} code
 * @param {{ timeLimit: number, questionIndex: number }} meta
 */
async function setTimerMeta(code, meta) {
  const payload = {
    timeLimit:     String(meta.timeLimit),
    questionIndex: String(meta.questionIndex),
    startedAt:     String(Date.now()),
  }
  await redis.hset(k.timer(code), 'timeLimit',     payload.timeLimit)
  await redis.hset(k.timer(code), 'questionIndex', payload.questionIndex)
  await redis.hset(k.timer(code), 'startedAt',     payload.startedAt)
  await redis.expire(k.timer(code), SESSION_TTL_SECS)
}

/**
 * Get timer metadata so a recovering process can calculate remaining time.
 * @returns {{ timeLimit: number, questionIndex: number, remaining: number } | null}
 */
async function getTimerMeta(code) {
  const raw = await redis.hgetall(k.timer(code))
  if (!raw || !raw.timeLimit) return null

  const timeLimit     = Number(raw.timeLimit)
  const startedAt     = Number(raw.startedAt)
  const elapsed       = Math.floor((Date.now() - startedAt) / 1000)
  const remaining     = Math.max(0, timeLimit - elapsed)

  return {
    timeLimit,
    questionIndex: Number(raw.questionIndex),
    remaining,
  }
}

/**
 * Delete timer metadata for a room.
 */
async function deleteTimerMeta(code) {
  await redis.del(k.timer(code))
}

// ─── Full room cleanup ────────────────────────────────────────────────────────

/**
 * Delete all Redis state for a room.
 * Call this from cleanupRoom() in quizSocket.js.
 */
async function cleanupRoomState(code) {
  await Promise.all([
    redis.del(k.votes(code)),
    redis.hdel(k.hosts(), code),
    redis.del(k.timer(code)),
    // ended flag intentionally kept — let it expire naturally (10 s)
    // so in-flight async callbacks can still detect it.
  ])
}

module.exports = {
  // votes
  initVotes,
  incrementVote,
  getVotes,
  deleteVotes,
  // hosts
  setHost,
  getHost,
  deleteHost,
  // throttle
  checkAndSetThrottle,
  deleteThrottle,
  // ended
  setRoomEnded,
  isRoomEnded,
  clearRoomEnded,
  // timer meta
  setTimerMeta,
  getTimerMeta,
  deleteTimerMeta,
  // cleanup
  cleanupRoomState,
}
/**
 * redisClient.js
 *
 * Exports a single ioredis client (or a lightweight in-process fallback
 * when REDIS_URL is not set / Redis is unreachable).
 *
 * The fallback makes local development work with zero extra setup,
 * while production always uses the real Redis instance.
 *
 * Usage (anywhere in server):
 *   const redis = require('./redisClient')
 *   await redis.set('key', 'value', 'EX', 60)
 *   const val = await redis.get('key')
 */

'use strict'

// ─── In-process fallback ──────────────────────────────────────────────────────
// Mimics the ioredis API surface used by redisStore.js:
//   get, set, del, hset, hget, hgetall, hdel, expire, exists, keys, mget

class InProcessFallback {
  constructor() {
    this._store = new Map()
    this._ttls  = new Map()
    this.isRedis = false
    console.warn(
      '[Redis] REDIS_URL not set — using in-process fallback. ' +
      'Set REDIS_URL in .env for production / multi-instance deployments.'
    )
  }

  _isExpired(key) {
    const exp = this._ttls.get(key)
    if (exp === undefined) return false
    if (Date.now() > exp) {
      this._store.delete(key)
      this._ttls.delete(key)
      return true
    }
    return false
  }

  async get(key) {
    if (this._isExpired(key)) return null
    return this._store.get(key) ?? null
  }

  async set(key, value, ...opts) {
    // Supports: set(key, val) and set(key, val, 'EX', seconds)
    this._store.set(key, String(value))
    const exIdx = opts.findIndex(o => String(o).toUpperCase() === 'EX')
    if (exIdx !== -1 && opts[exIdx + 1]) {
      this._ttls.set(key, Date.now() + Number(opts[exIdx + 1]) * 1000)
    }
    return 'OK'
  }

  async del(...keys) {
    let count = 0
    for (const k of keys.flat()) {
      if (this._store.delete(k)) count++
      this._ttls.delete(k)
    }
    return count
  }

  async hset(key, field, value) {
    const obj = JSON.parse(this._store.get(key) || '{}')
    obj[field] = value
    this._store.set(key, JSON.stringify(obj))
    return 1
  }

  async hget(key, field) {
    if (this._isExpired(key)) return null
    const obj = JSON.parse(this._store.get(key) || '{}')
    return obj[field] ?? null
  }

  async hgetall(key) {
    if (this._isExpired(key)) return null
    const raw = this._store.get(key)
    return raw ? JSON.parse(raw) : null
  }

  async hdel(key, ...fields) {
    const obj = JSON.parse(this._store.get(key) || '{}')
    let count = 0
    for (const f of fields.flat()) {
      if (f in obj) { delete obj[f]; count++ }
    }
    this._store.set(key, JSON.stringify(obj))
    return count
  }

  async expire(key, seconds) {
    if (!this._store.has(key)) return 0
    this._ttls.set(key, Date.now() + seconds * 1000)
    return 1
  }

  async exists(...keys) {
    return keys.flat().filter(k => !this._isExpired(k) && this._store.has(k)).length
  }

  async keys(pattern) {
    // Minimal glob: supports prefix* only
    const prefix = pattern.replace(/\*$/, '')
    return [...this._store.keys()].filter(k => k.startsWith(prefix) && !this._isExpired(k))
  }

  async mget(...keys) {
    return keys.flat().map(k => (this._isExpired(k) ? null : (this._store.get(k) ?? null)))
  }

  // No-op — the real client emits events
  on() { return this }
  disconnect() {}
}

// ─── Real ioredis client ──────────────────────────────────────────────────────
let client

if (process.env.REDIS_URL) {
  try {
    const Redis = require('ioredis')
    client = new Redis(process.env.REDIS_URL, {
      // Retry connection up to 10 times with exponential back-off, then give up
      // so the server doesn't hang forever if Redis is misconfigured.
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 10) {
          console.error('[Redis] Could not connect after 10 retries — aborting.')
          return null   // stop retrying
        }
        return Math.min(times * 100, 3000)   // ms delay
      },
    })
    client.isRedis = true

    client.on('connect',   () => console.log('[Redis] Connected'))
    client.on('error',     (err) => console.error('[Redis] Error:', err.message))
    client.on('reconnecting', () => console.warn('[Redis] Reconnecting…'))
  } catch (err) {
    console.error('[Redis] ioredis failed to load:', err.message)
    client = new InProcessFallback()
  }
} else {
  client = new InProcessFallback()
}

module.exports = client
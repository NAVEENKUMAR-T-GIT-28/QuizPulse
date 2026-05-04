// server/test/routes/auth.test.js

const request = require('supertest')
// server.js exports `app` without starting a listener — safe to import in tests
const app = require('../../server')
const db = require('../helpers/db')

beforeAll(() => db.connect())
afterAll(() => db.disconnect())
afterEach(() => db.clearCollections())

describe('POST /api/auth/register', () => {
  it('creates a user and sets an httpOnly cookie', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Alice', email: 'alice@test.com', password: 'secret123' })

    expect(res.status).toBe(201)
    expect(res.body.user).toMatchObject({ name: 'Alice', email: 'alice@test.com' })
    // Token must NOT be in the body
    expect(res.body.token).toBeUndefined()
    // httpOnly cookie must be set
    const cookieHeader = res.headers['set-cookie'] || []
    expect(cookieHeader.some(c => c.startsWith('token='))).toBe(true)
    expect(cookieHeader.some(c => c.includes('HttpOnly'))).toBe(true)
  })

  it('returns 409 when email is already registered', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Alice', email: 'alice@test.com', password: 'secret123' })

    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Alice2', email: 'alice@test.com', password: 'other' })

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/already in use/i)
  })

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'noname@test.com' })

    expect(res.status).toBe(400)
  })
})

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Bob', email: 'bob@test.com', password: 'mypassword' })
  })

  it('returns user and sets httpOnly cookie on valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'bob@test.com', password: 'mypassword' })

    expect(res.status).toBe(200)
    expect(res.body.user.name).toBe('Bob')
    expect(res.body.token).toBeUndefined()
    const cookieHeader = res.headers['set-cookie'] || []
    expect(cookieHeader.some(c => c.startsWith('token='))).toBe(true)
  })

  it('returns 401 on wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'bob@test.com', password: 'wrongpassword' })

    expect(res.status).toBe(401)
  })
})

describe('POST /api/auth/logout', () => {
  it('clears the token cookie', async () => {
    const res = await request(app).post('/api/auth/logout')
    const cookieHeader = res.headers['set-cookie'] || []
    // Cookie should be present but expired (maxAge=0 or Expires in the past)
    expect(cookieHeader.some(c => c.startsWith('token='))).toBe(true)
    expect(cookieHeader.some(c => c.includes('Max-Age=0') || c.includes('Expires=Thu, 01 Jan 1970'))).toBe(true)
  })
})
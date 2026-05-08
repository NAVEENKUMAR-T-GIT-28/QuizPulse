// server/test/routes/quiz.test.js
//
// Uses direct DB seeding (User model) to create verified users, then calls
// /api/auth/login to get the httpOnly cookie. This avoids the OTP email flow
// entirely while still exercising the real auth middleware.

const request = require('supertest')
const app     = require('../../server')
const db      = require('../helpers/db')
const User    = require('../../models/User')

let cookie   // Alice's session cookie

beforeAll(() => db.connect())
afterAll(()  => db.disconnect())
afterEach(() => db.clearCollections())

// ─── Helper: seed user directly + return login cookie ─────────────────────
async function loginAs(name, email, password) {
  const user = new User({ name, email, password })
  await user.save()   // pre-save hook hashes password
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password })
  return res.headers['set-cookie']
}

beforeEach(async () => {
  cookie = await loginAs('Alice', 'alice@test.com', 'password')
})

// ─── POST /api/quiz ───────────────────────────────────────────────────────
describe('POST /api/quiz', () => {
  it('creates a quiz for the logged-in host', async () => {
    const res = await request(app)
      .post('/api/quiz')
      .set('Cookie', cookie)
      .send({
        title: 'My Quiz',
        questions: [
          { text: 'Q1?', options: ['A', 'B', 'C', 'D'], correctIndex: 0, timeLimit: 10 }
        ]
      })

    expect(res.status).toBe(201)
    expect(res.body.quiz.title).toBe('My Quiz')
    expect(res.body.quiz.questions).toHaveLength(1)
  })

  it('returns 400 when title is missing', async () => {
    const res = await request(app)
      .post('/api/quiz')
      .set('Cookie', cookie)
      .send({ questions: [{ text: 'Q?', options: ['A', 'B'], correctIndex: 0 }] })

    expect(res.status).toBe(400)
  })

  it('returns 401 when not authenticated', async () => {
    const res = await request(app)
      .post('/api/quiz')
      .send({ title: 'Sneaky Quiz', questions: [] })

    expect(res.status).toBe(401)
  })

  it('returns 400 when quiz exceeds 25 questions', async () => {
    const questions = Array.from({ length: 26 }, (_, i) => ({
      text: `Question ${i + 1}?`,
      options: ['A', 'B'],
      correctIndex: 0,
      timeLimit: 10,
    }))
    const res = await request(app)
      .post('/api/quiz')
      .set('Cookie', cookie)
      .send({ title: 'Too Long', questions })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/25/i)
  })

  it('returns 400 when an option is an empty string', async () => {
    const res = await request(app)
      .post('/api/quiz')
      .set('Cookie', cookie)
      .send({
        title: 'Bad Options',
        questions: [{ text: 'Q?', options: ['A', ''], correctIndex: 0, timeLimit: 10 }]
      })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/non-empty/i)
  })

  it('returns 400 when an option exceeds 200 characters', async () => {
    const longOption = 'x'.repeat(201)
    const res = await request(app)
      .post('/api/quiz')
      .set('Cookie', cookie)
      .send({
        title: 'Long Option Quiz',
        questions: [{ text: 'Q?', options: ['A', longOption], correctIndex: 0, timeLimit: 10 }]
      })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/200/i)
  })

  it('returns 400 when correctIndex is out of range', async () => {
    const res = await request(app)
      .post('/api/quiz')
      .set('Cookie', cookie)
      .send({
        title: 'Bad Index',
        questions: [{ text: 'Q?', options: ['A', 'B'], correctIndex: 5, timeLimit: 10 }]
      })

    expect(res.status).toBe(400)
  })

  it('returns 400 when timeLimit is below 5', async () => {
    const res = await request(app)
      .post('/api/quiz')
      .set('Cookie', cookie)
      .send({
        title: 'Fast Quiz',
        questions: [{ text: 'Q?', options: ['A', 'B'], correctIndex: 0, timeLimit: 2 }]
      })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/5/i)
  })
})

// ─── GET /api/quiz ────────────────────────────────────────────────────────
describe('GET /api/quiz', () => {
  it('returns only quizzes owned by the logged-in host', async () => {
    await request(app)
      .post('/api/quiz')
      .set('Cookie', cookie)
      .send({
        title: 'Alice Quiz',
        questions: [{ text: 'Q?', options: ['A', 'B'], correctIndex: 0, timeLimit: 10 }]
      })

    const bobCookie = await loginAs('Bob', 'bob@test.com', 'password123')
    await request(app)
      .post('/api/quiz')
      .set('Cookie', bobCookie)
      .send({
        title: 'Bob Quiz',
        questions: [{ text: 'Q?', options: ['A', 'B'], correctIndex: 0, timeLimit: 10 }]
      })

    const res = await request(app).get('/api/quiz').set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body.quizzes).toHaveLength(1)
    expect(res.body.quizzes[0].title).toBe('Alice Quiz')
  })

  it('returns an empty array when the host has no quizzes', async () => {
    const res = await request(app).get('/api/quiz').set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body.quizzes).toHaveLength(0)
  })

  it('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/quiz')
    expect(res.status).toBe(401)
  })
})

// ─── GET /api/quiz/:id ────────────────────────────────────────────────────
describe('GET /api/quiz/:id', () => {
  it('returns the quiz when owned by the logged-in host', async () => {
    const create = await request(app)
      .post('/api/quiz')
      .set('Cookie', cookie)
      .send({
        title: 'Fetch Me',
        questions: [{ text: 'Q?', options: ['A', 'B'], correctIndex: 0, timeLimit: 10 }]
      })

    const quizId = create.body.quiz._id
    const res = await request(app).get(`/api/quiz/${quizId}`).set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(res.body.quiz.title).toBe('Fetch Me')
  })

  it('returns 404 when quiz belongs to another host', async () => {
    const create = await request(app)
      .post('/api/quiz')
      .set('Cookie', cookie)
      .send({
        title: 'Not Yours',
        questions: [{ text: 'Q?', options: ['A', 'B'], correctIndex: 0, timeLimit: 10 }]
      })

    const quizId = create.body.quiz._id
    const bobCookie = await loginAs('Bob', 'bob@test.com', 'password123')
    const res = await request(app).get(`/api/quiz/${quizId}`).set('Cookie', bobCookie)

    expect(res.status).toBe(404)
  })
})

// ─── PUT /api/quiz/:id ────────────────────────────────────────────────────
describe('PUT /api/quiz/:id', () => {
  it('updates the quiz title', async () => {
    const create = await request(app)
      .post('/api/quiz')
      .set('Cookie', cookie)
      .send({
        title: 'Original',
        questions: [{ text: 'Q?', options: ['A', 'B'], correctIndex: 0, timeLimit: 10 }]
      })

    const quizId = create.body.quiz._id

    const res = await request(app)
      .put(`/api/quiz/${quizId}`)
      .set('Cookie', cookie)
      .send({ title: 'Updated' })

    expect(res.status).toBe(200)
    expect(res.body.quiz.title).toBe('Updated')
  })

  it('returns 404 when updating another host\'s quiz', async () => {
    const create = await request(app)
      .post('/api/quiz')
      .set('Cookie', cookie)
      .send({
        title: 'Alice Quiz',
        questions: [{ text: 'Q?', options: ['A', 'B'], correctIndex: 0, timeLimit: 10 }]
      })

    const quizId = create.body.quiz._id
    const bobCookie = await loginAs('Bob', 'bob@test.com', 'password123')

    const res = await request(app)
      .put(`/api/quiz/${quizId}`)
      .set('Cookie', bobCookie)
      .send({ title: 'Stolen' })

    expect(res.status).toBe(404)
  })
})

// ─── DELETE /api/quiz/:id ─────────────────────────────────────────────────
describe('DELETE /api/quiz/:id', () => {
  it('deletes the quiz and returns 200', async () => {
    const create = await request(app)
      .post('/api/quiz')
      .set('Cookie', cookie)
      .send({
        title: 'Delete me',
        questions: [{ text: 'Q?', options: ['A', 'B'], correctIndex: 0, timeLimit: 10 }]
      })

    const quizId = create.body.quiz._id

    const del = await request(app).delete(`/api/quiz/${quizId}`).set('Cookie', cookie)
    expect(del.status).toBe(200)

    const list = await request(app).get('/api/quiz').set('Cookie', cookie)
    expect(list.body.quizzes).toHaveLength(0)
  })

  it('returns 404 when trying to delete another host\'s quiz', async () => {
    const create = await request(app)
      .post('/api/quiz')
      .set('Cookie', cookie)
      .send({
        title: 'Not yours',
        questions: [{ text: 'Q?', options: ['A', 'B'], correctIndex: 0, timeLimit: 10 }]
      })

    const quizId = create.body.quiz._id
    const bobCookie = await loginAs('Bob', 'bob@test.com', 'password123')

    const res = await request(app).delete(`/api/quiz/${quizId}`).set('Cookie', bobCookie)
    expect(res.status).toBe(404)
  })
})

// ─── POST /api/quiz/:id/session ───────────────────────────────────────────
describe('POST /api/quiz/:id/session', () => {
  it('creates a session and returns a 6-char roomCode', async () => {
    const create = await request(app)
      .post('/api/quiz')
      .set('Cookie', cookie)
      .send({
        title: 'Live Quiz',
        questions: [{ text: 'Q?', options: ['A', 'B'], correctIndex: 0, timeLimit: 10 }]
      })

    const quizId = create.body.quiz._id

    const res = await request(app)
      .post(`/api/quiz/${quizId}/session`)
      .set('Cookie', cookie)

    expect(res.status).toBe(201)
    expect(res.body.roomCode).toMatch(/^[A-Z0-9]{6}$/)
    expect(res.body.sessionId).toBeDefined()
  })

  it('returns 404 when quiz belongs to another host', async () => {
    const create = await request(app)
      .post('/api/quiz')
      .set('Cookie', cookie)
      .send({
        title: 'Alice Quiz',
        questions: [{ text: 'Q?', options: ['A', 'B'], correctIndex: 0, timeLimit: 10 }]
      })

    const quizId = create.body.quiz._id
    const bobCookie = await loginAs('Bob', 'bob@test.com', 'password123')

    const res = await request(app)
      .post(`/api/quiz/${quizId}/session`)
      .set('Cookie', bobCookie)

    expect(res.status).toBe(404)
  })
})
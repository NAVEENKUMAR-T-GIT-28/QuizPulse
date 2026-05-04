// server/test/routes/quiz.test.js

const request = require('supertest')
const app     = require('../../server')
const db      = require('../helpers/db')

let cookie   // stores the session cookie after login

beforeAll(() => db.connect())
afterAll(() => db.disconnect())
afterEach(() => db.clearCollections())

// Helper — register + login, capture cookie
async function loginAs(name, email, password) {
  await request(app).post('/api/auth/register').send({ name, email, password })
  const res = await request(app).post('/api/auth/login').send({ email, password })
  return res.headers['set-cookie']
}

beforeEach(async () => {
  cookie = await loginAs('Alice', 'alice@test.com', 'password')
})

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
})

describe('GET /api/quiz', () => {
  it('returns only quizzes owned by the logged-in host', async () => {
    // Create a quiz as Alice
    await request(app)
      .post('/api/quiz')
      .set('Cookie', cookie)
      .send({
        title: 'Alice Quiz',
        questions: [{ text: 'Q?', options: ['A', 'B'], correctIndex: 0, timeLimit: 10 }]
      })

    // Create another user and log in as them
    const otherCookie = await loginAs('Bob', 'bob@test.com', 'password123')
    await request(app)
      .post('/api/quiz')
      .set('Cookie', otherCookie)
      .send({
        title: 'Bob Quiz',
        questions: [{ text: 'Q?', options: ['A', 'B'], correctIndex: 0, timeLimit: 10 }]
      })

    // Alice should only see her own quiz
    const res = await request(app).get('/api/quiz').set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body.quizzes).toHaveLength(1)
    expect(res.body.quizzes[0].title).toBe('Alice Quiz')
  })
})

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

    const otherCookie = await loginAs('Bob', 'bob@test.com', 'password123')
    const res = await request(app).delete(`/api/quiz/${quizId}`).set('Cookie', otherCookie)
    expect(res.status).toBe(404)
  })
})
// server/test/socket/quizSocket.test.js

const http        = require('http')
const { Server }  = require('socket.io')
const ioClient    = require('socket.io-client')
const mongoose    = require('mongoose')
const jwt         = require('jsonwebtoken')
const db          = require('../helpers/db')
const { initQuizSocket } = require('../../socket/quizSocket')
const Session     = require('../../models/Session')
const Quiz        = require('../../models/Quiz')
const User        = require('../../models/User')

process.env.JWT_SECRET = 'test-secret'

let httpServer, io, port

// Helper — create a connected client socket
function createClient(opts = {}) {
  return ioClient(`http://localhost:${port}`, {
    transports:      ['websocket'],
    autoConnect:     false,
    ...opts,
  })
}

// Helper — wait for an event on a socket with a timeout
function waitFor(socket, event, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout waiting for "${event}"`)), timeoutMs)
    socket.once(event, (data) => {
      clearTimeout(t)
      resolve(data)
    })
  })
}

// Helper — seed a quiz + session in the test DB
async function seedSession(overrides = {}) {
  const user = await User.create({
    name: 'Host', email: 'host@test.com', password: 'hashed123'
  })
  const quiz = await Quiz.create({
    hostId: user._id,
    title:  'Test Quiz',
    questions: [
      { text: 'Q1?', options: ['A', 'B', 'C', 'D'], correctIndex: 2, timeLimit: 30 },
      { text: 'Q2?', options: ['A', 'B'],             correctIndex: 0, timeLimit: 20 },
    ]
  })
  const session = await Session.create({
    quizId:   quiz._id,
    hostId:   user._id,
    roomCode: 'TEST01',
    status:   'waiting',
    ...overrides,
  })
  const token = jwt.sign(
    { id: user._id, name: user.name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  )
  return { user, quiz, session, token }
}

beforeAll(async () => {
  await db.connect()
  httpServer = http.createServer()
  io         = new Server(httpServer)
  initQuizSocket(io)
  await new Promise((res) => httpServer.listen(0, res))
  port = httpServer.address().port
})

afterAll(async () => {
  io.close()
  httpServer.close()
  await db.disconnect()
})

afterEach(async () => {
  await db.clearCollections()
  // Disconnect any lingering sockets
  const sockets = await io.fetchSockets()
  sockets.forEach(s => s.disconnect(true))
})

// ─── player:join ──────────────────────────────────────────────────
describe('player:join', () => {
  it('emits player:joined with quiz title and waiting status', async () => {
    const { session } = await seedSession()
    const client = createClient()
    client.connect()

    client.emit('player:join', {
      roomCode:   session.roomCode,
      playerName: 'Alice',
      playerId:   'player-uuid-1',
    })

    const data = await waitFor(client, 'player:joined')
    expect(data.roomCode).toBe('TEST01')
    expect(data.status).toBe('waiting')
    expect(data.quizTitle).toBe('Test Quiz')
    client.disconnect()
  })

  it('emits error when room is not found', async () => {
    const client = createClient()
    client.connect()

    client.emit('player:join', {
      roomCode:   'NOPE99',
      playerName: 'Bob',
      playerId:   'player-uuid-2',
    })

    const err = await waitFor(client, 'error')
    expect(err.message).toMatch(/not found/i)
    client.disconnect()
  })

  it('rejects empty player name', async () => {
    const { session } = await seedSession()
    const client = createClient()
    client.connect()

    client.emit('player:join', {
      roomCode:   session.roomCode,
      playerName: '   ',
      playerId:   'player-uuid-3',
    })

    const err = await waitFor(client, 'error')
    expect(err.message).toMatch(/empty/i)
    client.disconnect()
  })

  it('prevents joining an ended session', async () => {
    const { session } = await seedSession({ status: 'ended' })
    const client = createClient()
    client.connect()

    client.emit('player:join', {
      roomCode:   session.roomCode,
      playerName: 'Late',
      playerId:   'player-uuid-4',
    })

    const err = await waitFor(client, 'error')
    expect(err.message).toMatch(/ended/i)
    client.disconnect()
  })
})

// ─── host:join → quiz:start → player:answer → quiz:reveal ─────────
describe('full quiz flow', () => {
  it('completes a question round from start to reveal', async () => {
    const { session, token } = await seedSession()

    const host   = createClient({ auth: { token } })
    const player = createClient()

    host.connect()
    player.connect()

    // Host joins
    host.emit('host:join', { roomCode: session.roomCode })
    await waitFor(host, 'host:joined')

    // Player joins
    player.emit('player:join', {
      roomCode:   session.roomCode,
      playerName: 'Alice',
      playerId:   'player-001',
    })
    await waitFor(player, 'player:joined')

    // Host starts the quiz
    host.emit('quiz:start', { roomCode: session.roomCode })
    const question = await waitFor(player, 'quiz:question')
    expect(question.text).toBe('Q1?')
    expect(question.options).toHaveLength(4)
    // correctIndex must NOT be in the payload
    expect(question.correctIndex).toBeUndefined()

    // Player submits an answer (option index 2 — correct)
    player.emit('player:answer', {
      roomCode:      session.roomCode,
      questionIndex: 0,
      optionIndex:   2,
      playerId:      'player-001',
    })
    await waitFor(player, 'answer:received')

    // Host reveals the answer
    host.emit('quiz:reveal', { roomCode: session.roomCode })
    const result = await waitFor(player, 'quiz:result')
    expect(result.correctIndex).toBe(2)
    expect(result.votes[2]).toBe(1)
    expect(result.leaderboard[0].name).toBe('Alice')
    // Player answered correctly — should have points
    expect(result.leaderboard[0].score).toBeGreaterThan(0)

    host.disconnect()
    player.disconnect()
  })

  it('does not allow a non-host to start the quiz', async () => {
    const { session } = await seedSession()
    const rogue = createClient()
    rogue.connect()

    // Rogue joins as a player (no token)
    rogue.emit('player:join', {
      roomCode:   session.roomCode,
      playerName: 'Hacker',
      playerId:   'rogue-001',
    })
    await waitFor(rogue, 'player:joined')

    // Rogue tries to start the quiz
    rogue.emit('quiz:start', { roomCode: session.roomCode })

    // quiz:question must NOT be emitted — wait 500ms and confirm silence
    const received = await Promise.race([
      waitFor(rogue, 'quiz:question', 500).then(() => true).catch(() => false),
      new Promise(res => setTimeout(() => res(false), 600)),
    ])
    expect(received).toBe(false)

    rogue.disconnect()
  })
})

// ─── Timer ───────────────────────────────────────────────────────
describe('timer:tick', () => {
  it('emits timer ticks after quiz:start', async () => {
    const { session, token } = await seedSession()
    const host   = createClient({ auth: { token } })
    const player = createClient()

    host.connect()
    player.connect()

    host.emit('host:join', { roomCode: session.roomCode })
    await waitFor(host, 'host:joined')

    player.emit('player:join', {
      roomCode: session.roomCode, playerName: 'P', playerId: 'p1'
    })
    await waitFor(player, 'player:joined')

    host.emit('quiz:start', { roomCode: session.roomCode })
    await waitFor(player, 'quiz:question')

    // At least one tick should arrive within 2 seconds
    const tick = await waitFor(player, 'timer:tick', 2000)
    expect(typeof tick.remaining).toBe('number')
    expect(tick.remaining).toBeGreaterThanOrEqual(0)

    host.emit('quiz:end', { roomCode: session.roomCode })
    host.disconnect()
    player.disconnect()
  })
})
// server/test/routes/auth.test.js
//
// Registration is a two-step OTP flow:
//   POST /api/auth/register/initiate  → hashes password+OTP, stores Otp doc, sends email (202)
//   POST /api/auth/register/verify    → verifies OTP, creates User, sets httpOnly cookie (201)
//
// emailService is mocked so tests never hit a real SMTP server — no hangs,
// no 30-second TCP timeouts. The mock lets us control success vs failure per-test.
//
// For tests that just need an authenticated user, registerAndLogin() seeds
// a User directly via the model then calls /login — no OTP involved.

jest.mock('../../services/emailService', () => ({
  sendOtpEmail: jest.fn().mockResolvedValue(undefined),
}))

const request        = require('supertest')
const app            = require('../../server')
const db             = require('../helpers/db')
const User           = require('../../models/User')
const Otp            = require('../../models/Otp')
const bcrypt         = require('bcryptjs')
const { sendOtpEmail } = require('../../services/emailService')

beforeAll(() => db.connect())
afterAll(()  => db.disconnect())
afterEach(() => {
  db.clearCollections()
  jest.clearAllMocks()   // reset mock call counts between tests
})

// ─── Helper: seed verified user + return login cookie ─────────────────────
// Creates a User directly in the DB (bypasses OTP) then gets a real JWT cookie.
async function registerAndLogin(name, email, password) {
  const user = new User({ name, email, password })
  await user.save()   // pre-save hook hashes the password
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password })
  return res.headers['set-cookie']
}

// ─── Helper: run initiate + patch the Otp record with a known OTP hash ────
// Returns the known OTP string so the caller can pass it to /register/verify.
async function initiateAndPatchOtp(name, email, password, knownOtp = '123456') {
  const res = await request(app)
    .post('/api/auth/register/initiate')
    .send({ name, email, password })

  // initiate should succeed because sendOtpEmail is mocked
  expect(res.status).toBe(202)

  const record = await Otp.findOne({ email })
  expect(record).not.toBeNull()

  // Replace the stored OTP hash with a known value so we can verify
  const salt = await bcrypt.genSalt(10)
  record.otpHash  = await bcrypt.hash(knownOtp, salt)
  record.attempts = 0
  await record.save()

  return knownOtp
}

// ─── POST /api/auth/register/initiate ─────────────────────────────────────
describe('POST /api/auth/register/initiate', () => {
  it('returns 202 and calls sendOtpEmail for a valid new email', async () => {
    const res = await request(app)
      .post('/api/auth/register/initiate')
      .send({ name: 'Alice', email: 'alice@test.com', password: 'secret123' })

    expect(res.status).toBe(202)
    expect(sendOtpEmail).toHaveBeenCalledTimes(1)
    expect(sendOtpEmail).toHaveBeenCalledWith('alice@test.com', 'Alice', expect.any(String))
  })

  it('does NOT create a User document at the initiate step', async () => {
    await request(app)
      .post('/api/auth/register/initiate')
      .send({ name: 'Alice', email: 'alice@test.com', password: 'secret123' })

    const user = await User.findOne({ email: 'alice@test.com' })
    expect(user).toBeNull()
  })

  it('creates an Otp record at the initiate step', async () => {
    await request(app)
      .post('/api/auth/register/initiate')
      .send({ name: 'Alice', email: 'alice@test.com', password: 'secret123' })

    const record = await Otp.findOne({ email: 'alice@test.com' })
    expect(record).not.toBeNull()
    expect(record.name).toBe('Alice')
  })

  it('returns 409 when email is already registered', async () => {
    await registerAndLogin('Alice', 'alice@test.com', 'secret123')

    const res = await request(app)
      .post('/api/auth/register/initiate')
      .send({ name: 'Alice2', email: 'alice@test.com', password: 'other123' })

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/already in use/i)
  })

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/auth/register/initiate')
      .send({ email: 'noname@test.com' })

    expect(res.status).toBe(400)
    expect(sendOtpEmail).not.toHaveBeenCalled()
  })

  it('returns 400 when password is shorter than 6 characters', async () => {
    const res = await request(app)
      .post('/api/auth/register/initiate')
      .send({ name: 'Alice', email: 'alice@test.com', password: '123' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/6 characters/i)
    expect(sendOtpEmail).not.toHaveBeenCalled()
  })

  it('returns 502 and deletes the Otp record when email delivery fails', async () => {
    sendOtpEmail.mockRejectedValueOnce(new Error('SMTP connection refused'))

    const res = await request(app)
      .post('/api/auth/register/initiate')
      .send({ name: 'Alice', email: 'alice@test.com', password: 'secret123' })

    expect(res.status).toBe(502)
    // Otp record must be cleaned up so the user can retry
    const record = await Otp.findOne({ email: 'alice@test.com' })
    expect(record).toBeNull()
  })
})

// ─── POST /api/auth/register/verify ───────────────────────────────────────
describe('POST /api/auth/register/verify', () => {
  it('creates a user and sets an httpOnly cookie when OTP matches', async () => {
    const otp = await initiateAndPatchOtp('Bob', 'bob@test.com', 'mypassword')

    const res = await request(app)
      .post('/api/auth/register/verify')
      .send({ email: 'bob@test.com', otp })

    expect(res.status).toBe(201)
    expect(res.body.user).toMatchObject({ name: 'Bob', email: 'bob@test.com' })
    // Token must NOT be in the body — httpOnly cookie only
    expect(res.body.token).toBeUndefined()
    const cookieHeader = res.headers['set-cookie'] || []
    expect(cookieHeader.some(c => c.startsWith('token='))).toBe(true)
    expect(cookieHeader.some(c => c.includes('HttpOnly'))).toBe(true)
  })

  it('deletes the Otp record after successful verification', async () => {
    const otp = await initiateAndPatchOtp('Bob', 'bob@test.com', 'mypassword')
    await request(app).post('/api/auth/register/verify').send({ email: 'bob@test.com', otp })

    const record = await Otp.findOne({ email: 'bob@test.com' })
    expect(record).toBeNull()
  })

  it('returns 400 for an incorrect OTP', async () => {
    await initiateAndPatchOtp('Carol', 'carol@test.com', 'pass1234')

    const res = await request(app)
      .post('/api/auth/register/verify')
      .send({ email: 'carol@test.com', otp: '000000' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/incorrect/i)
  })

  it('increments the attempts counter on wrong OTP', async () => {
    await initiateAndPatchOtp('Dan', 'dan@test.com', 'pass1234')

    await request(app)
      .post('/api/auth/register/verify')
      .send({ email: 'dan@test.com', otp: '000000' })

    const record = await Otp.findOne({ email: 'dan@test.com' })
    expect(record.attempts).toBe(1)
  })

  it('returns 400 when no pending verification exists', async () => {
    const res = await request(app)
      .post('/api/auth/register/verify')
      .send({ email: 'nobody@test.com', otp: '123456' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/no pending/i)
  })

  it('returns 400 when email or otp is missing', async () => {
    const res = await request(app)
      .post('/api/auth/register/verify')
      .send({ email: 'x@test.com' })   // otp missing

    expect(res.status).toBe(400)
  })
})

// ─── POST /api/auth/register/resend ───────────────────────────────────────
describe('POST /api/auth/register/resend', () => {
  it('resends OTP and resets attempts counter', async () => {
    await initiateAndPatchOtp('Eve', 'eve@test.com', 'pass1234')

    // Simulate a failed attempt
    await Otp.findOneAndUpdate({ email: 'eve@test.com' }, { attempts: 3 })

    sendOtpEmail.mockClear()
    const res = await request(app)
      .post('/api/auth/register/resend')
      .send({ email: 'eve@test.com' })

    expect(res.status).toBe(200)
    expect(sendOtpEmail).toHaveBeenCalledTimes(1)

    const record = await Otp.findOne({ email: 'eve@test.com' })
    expect(record.attempts).toBe(0)
  })

  it('returns 400 when no pending record exists', async () => {
    const res = await request(app)
      .post('/api/auth/register/resend')
      .send({ email: 'ghost@test.com' })

    expect(res.status).toBe(400)
  })
})

// ─── POST /api/auth/login ─────────────────────────────────────────────────
describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await registerAndLogin('Bob', 'bob@test.com', 'mypassword')
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

  it('returns 401 for unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@test.com', password: 'whatever' })

    expect(res.status).toBe(401)
  })

  it('returns 400 when fields are missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'bob@test.com' })

    expect(res.status).toBe(400)
  })
})

// ─── POST /api/auth/logout ────────────────────────────────────────────────
describe('POST /api/auth/logout', () => {
  it('clears the token cookie', async () => {
    const res = await request(app).post('/api/auth/logout')
    const cookieHeader = res.headers['set-cookie'] || []
    expect(cookieHeader.some(c => c.startsWith('token='))).toBe(true)
    expect(
      cookieHeader.some(c => c.includes('Max-Age=0') || c.includes('Expires=Thu, 01 Jan 1970'))
    ).toBe(true)
  })
})

// ─── GET /api/auth/me ─────────────────────────────────────────────────────
describe('GET /api/auth/me', () => {
  it('returns the current user when authenticated', async () => {
    const cookie = await registerAndLogin('Dana', 'dana@test.com', 'pass1234')

    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(res.body.user.name).toBe('Dana')
    expect(res.body.user.email).toBe('dana@test.com')
    expect(res.body.user.password).toBeUndefined()
  })

  it('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(401)
  })
})

// ─── PATCH /api/auth/profile ──────────────────────────────────────────────
describe('PATCH /api/auth/profile', () => {
  it('updates the display name and refreshes the cookie', async () => {
    const cookie = await registerAndLogin('Eve', 'eve@test.com', 'pass1234')

    const res = await request(app)
      .patch('/api/auth/profile')
      .set('Cookie', cookie)
      .send({ name: 'Eve Updated' })

    expect(res.status).toBe(200)
    expect(res.body.user.name).toBe('Eve Updated')
    const cookieHeader = res.headers['set-cookie'] || []
    expect(cookieHeader.some(c => c.startsWith('token='))).toBe(true)
  })

  it('returns 409 if the new email is taken by another account', async () => {
    const cookie = await registerAndLogin('Frank', 'frank@test.com', 'pass1234')
    await registerAndLogin('Grace', 'grace@test.com', 'pass1234')

    const res = await request(app)
      .patch('/api/auth/profile')
      .set('Cookie', cookie)
      .send({ email: 'grace@test.com' })

    expect(res.status).toBe(409)
  })

  it('returns 400 when no fields are provided', async () => {
    const cookie = await registerAndLogin('Hank', 'hank@test.com', 'pass1234')

    const res = await request(app)
      .patch('/api/auth/profile')
      .set('Cookie', cookie)
      .send({})

    expect(res.status).toBe(400)
  })
})

// ─── POST /api/auth/profile/change-password ──────────────────────────────
describe('POST /api/auth/profile/change-password', () => {
  it('changes the password successfully', async () => {
    const cookie = await registerAndLogin('Iris', 'iris@test.com', 'oldpass1')

    const res = await request(app)
      .post('/api/auth/profile/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: 'oldpass1', newPassword: 'newpass1' })

    expect(res.status).toBe(200)

    // Old password must no longer work
    const loginOld = await request(app)
      .post('/api/auth/login')
      .send({ email: 'iris@test.com', password: 'oldpass1' })
    expect(loginOld.status).toBe(401)

    // New password must work
    const loginNew = await request(app)
      .post('/api/auth/login')
      .send({ email: 'iris@test.com', password: 'newpass1' })
    expect(loginNew.status).toBe(200)
  })

  it('returns 401 when current password is wrong', async () => {
    const cookie = await registerAndLogin('Jack', 'jack@test.com', 'pass1234')

    const res = await request(app)
      .post('/api/auth/profile/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: 'wrongpass', newPassword: 'newpass1234' })

    expect(res.status).toBe(401)
  })

  it('returns 400 when new password is too short', async () => {
    const cookie = await registerAndLogin('Kara', 'kara@test.com', 'pass1234')

    const res = await request(app)
      .post('/api/auth/profile/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: 'pass1234', newPassword: '123' })

    expect(res.status).toBe(400)
  })
})

// ─── DELETE /api/auth/account ─────────────────────────────────────────────
describe('DELETE /api/auth/account', () => {
  it('deletes the account and clears the cookie', async () => {
    const cookie = await registerAndLogin('Leo', 'leo@test.com', 'pass1234')

    const res = await request(app)
      .delete('/api/auth/account')
      .set('Cookie', cookie)
      .send({ password: 'pass1234' })

    expect(res.status).toBe(200)
    const cookieHeader = res.headers['set-cookie'] || []
    expect(
      cookieHeader.some(c => c.includes('Max-Age=0') || c.includes('Expires=Thu, 01 Jan 1970'))
    ).toBe(true)
    const user = await User.findOne({ email: 'leo@test.com' })
    expect(user).toBeNull()
  })

  it('returns 401 when password is wrong', async () => {
    const cookie = await registerAndLogin('Mia', 'mia@test.com', 'pass1234')

    const res = await request(app)
      .delete('/api/auth/account')
      .set('Cookie', cookie)
      .send({ password: 'wrongpass' })

    expect(res.status).toBe(401)
  })
})
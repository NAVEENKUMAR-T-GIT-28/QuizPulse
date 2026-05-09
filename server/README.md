# ⚡ QuizPulse — Backend Documentation

> Complete technical reference for the Node.js + Express + Socket.io server application.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Tech Stack & Dependencies](#tech-stack--dependencies)
- [Project Structure](#project-structure)
- [Entry Point — `server.js`](#entry-point--serverjs)
- [Environment Variables](#environment-variables)
- [Database — MongoDB Atlas](#database--mongodb-atlas)
  - [User Model](#user-model)
  - [Quiz Model](#quiz-model)
  - [Session Model](#session-model)
  - [Otp Model](#otp-model)
- [REST API Reference](#rest-api-reference)
  - [Auth Routes — `/api/auth`](#auth-routes--apiauth)
  - [Quiz Routes — `/api/quiz`](#quiz-routes--apiquiz)
  - [Session Routes — `/api/session`](#session-routes--apisession)
  - [Export Routes — `/api/export`](#export-routes--apiexport)
- [Middleware](#middleware)
  - [JWT Auth Middleware](#jwt-auth-middleware)
  - [Helmet (Security Headers)](#helmet-security-headers)
  - [Rate Limiting](#rate-limiting)
  - [CORS](#cors)
  - [asyncHandler](#asynchandler)
- [WebSocket Layer — Socket.io](#websocket-layer--socketio)
  - [Socket Architecture](#socket-architecture)
  - [In-Memory Room State](#in-memory-room-state)
  - [Session State Machine](#session-state-machine)
  - [Socket Event Handlers — Host](#socket-event-handlers--host)
  - [Socket Event Handlers — Player](#socket-event-handlers--player)
  - [Timer Logic](#timer-logic)
  - [Socket Event Reference](#socket-event-reference)
- [Business Logic & Services](#business-logic--services)
  - [Scoring Algorithm](#scoring-algorithm)
  - [PDF Generation Service](#pdf-generation-service)
  - [OTP Service](#otp-service)
  - [Email Service (Nodemailer)](#email-service-nodemailer)
- [Utils](#utils)
  - [roomCode Generator](#roomcode-generator)
  - [DB Helpers](#db-helpers)
- [Security Implementation](#security-implementation)
- [Error Handling Strategy](#error-handling-strategy)
- [Testing](#testing)
- [Deployment — Render](#deployment--render)
- [Development Setup](#development-setup)

---

## Project Overview

The QuizPulse backend is a **Node.js + Express** server that handles all authentication, quiz CRUD, live session management, and real-time WebSocket communication. It serves as the single source of truth for all session state — the in-memory room map on the server is authoritative during live sessions, and results are persisted to MongoDB Atlas once a session ends.

The server is designed around two communication channels:

| Channel | Technology | Purpose |
|---------|-----------|---------|
| REST API | Express + Axios | Auth, quiz CRUD, session lifecycle, export |
| WebSocket | Socket.io | Real-time events during live sessions |

Authentication uses **JWT stored in `httpOnly` cookies** — no tokens are ever returned to JavaScript on the client.

---

## Tech Stack & Dependencies

| Package | Version | Role |
|---------|---------|------|
| `express` | 4.x | HTTP framework |
| `socket.io` | 4.x | WebSocket server |
| `mongoose` | 8.x | MongoDB ODM |
| `bcryptjs` | 2.x | Password & OTP hashing |
| `jsonwebtoken` | 9.x | JWT signing & verification |
| `nodemailer` | 8.x | OTP email delivery via Gmail SMTP |
| `pdfkit` | 0.18 | Fallback PDF generation |
| `puppeteer` | 21.x | High-quality PDF generation (optional) |
| `pino` | 9.x | Structured logging |
| `@sentry/node` | 8.x | Real-time error tracking |
| `helmet` | 8.x | HTTP security headers |
| `express-rate-limit` | 8.x | API rate limiting |
| `sanitize-html` | 2.x | Player name XSS protection |
| `cors` | 2.x | CORS configuration |
| `cookie-parser` | 1.x | Parse `httpOnly` JWT cookies |
| `dotenv` | 16.x | Environment variable loading |
| `nodemon` | 3.x | Dev auto-restart (devDependency) |
| `jest` | 30.x | Test framework (devDependency) |

---

## Project Structure

```
server/
├── middleware/
│   └── auth.js                  # JWT cookie verification middleware
├── models/
│   ├── User.js                  # Mongoose User schema
│   ├── Quiz.js                  # Mongoose Quiz schema
│   ├── Session.js               # Mongoose Session schema
│   └── Otp.js                   # Mongoose OTP schema (TTL index)
├── routes/
│   ├── auth.js                  # /api/auth/* route handlers
│   ├── quiz.js                  # /api/quiz/* route handlers
│   ├── session.js               # /api/session/* route handlers
│   └── export.js                # /api/export/* route handlers
├── services/
│   ├── pdfService.js            # Puppeteer + PDFKit PDF generation
│   └── emailService.js          # Nodemailer OTP email delivery
├── socket/
│   └── quizSocket.js            # All Socket.io event handlers & room state
├── utils/
│   ├── roomCode.js              # 6-character alphanumeric room code generator
│   ├── asyncHandler.js          # Express async error wrapper
│   └── db.js                    # Mongoose connection helper
├── test/
│   ├── auth.test.js             # Auth route test suite
│   ├── quiz.test.js             # Quiz CRUD test suite
│   └── session.test.js          # Session lifecycle test suite
├── server.js                    # Entry point — Express + Socket.io bootstrap
├── .env.example                 # Environment variable template
└── package.json
```

---

## Entry Point — `server.js`

The entry point bootstraps the entire server in the following order:

1. **`dotenv.config()`** — loads `.env` variables before any module uses them.
2. **Express app created** — `const app = express()`.
3. **Security middleware applied** — Helmet headers, CORS, rate limiter, `cookie-parser`, `express.json()`.
4. **REST routes mounted:**
   - `/api/auth` → `routes/auth.js`
   - `/api/quiz` → `routes/quiz.js`
   - `/api/session` → `routes/session.js`
   - `/api/export` → `routes/export.js`
5. **HTTP server created** — `http.createServer(app)` so Socket.io can share the same port.
6. **Socket.io attached** — `new Server(httpServer, { cors: {...} })`.
7. **`quizSocket(io)`** — registers all socket event handlers.
8. **MongoDB connection** — `mongoose.connect(MONGODB_URI)`.
9. **Server listens** — `httpServer.listen(PORT)`.

```js
// Simplified bootstrap
const app = express()
applyMiddleware(app)
mountRoutes(app)
const httpServer = http.createServer(app)
const io = new Server(httpServer, { cors: corsOptions })
quizSocket(io)
await mongoose.connect(process.env.MONGODB_URI)
httpServer.listen(process.env.PORT || 5000)
```

The HTTP server and Socket.io server share port `5000`. WebSocket upgrade requests on `/socket.io` are handled by Socket.io directly; all other requests are handled by Express.

---

## Environment Variables

Copy `.env.example` and fill in values:

```bash
cp .env.example .env
```

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | ✅ | `5000` | HTTP server port |
| `NODE_ENV` | ✅ | — | `development` or `production` |
| `MONGODB_URI` | ✅ | — | MongoDB Atlas connection string (includes DB name) |
| `TEST_MONGODB_URI` | ❌ | `mongodb://...` | MongoDB connection string for running the test suite |
| `JWT_SECRET` | ✅ | — | Long random string for JWT signing. Generate with `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `CLIENT_URL` | ✅ | — | Frontend origin(s) for CORS. Comma-separated for multiple (e.g. `https://app.vercel.app,http://localhost:5173`) |
| `SMTP_USER` | ✅ | — | Gmail address used to send OTP emails |
| `SMTP_PASS` | ✅ | — | Gmail App Password (not your Gmail password) |
| `ENABLE_PUPPETEER` | ❌ | `false` | Set to `true` to enable high-quality PDF. Requires 512MB+ RAM |
| `SENTRY_DSN` | ❌ | — | Sentry DSN for real-time error tracking |
| `LOG_LEVEL` | ❌ | `info` | Pino log level (`info`, `debug`, `error`, etc.) |

**Generating a secure `JWT_SECRET`:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Database — MongoDB Atlas

The server uses **Mongoose 8** as the ODM. All models are defined in `models/`. The database name is included in `MONGODB_URI`.

### User Model

**File:** `models/User.js`  
**Collection:** `users`

```
User {
  name:       String  (required, trimmed, max 60 chars)
  email:      String  (required, unique, lowercase, trimmed)
  password:   String  (required, bcrypt hash, never returned in queries)
  createdAt:  Date    (auto, set by timestamps option)
  updatedAt:  Date    (auto, set by timestamps option)
}
```

**Indexes:** `email` has a unique index for fast lookup and duplicate prevention.

**Password handling:** Raw passwords are **never stored**. Before saving, `bcryptjs.hash(password, 12)` is called in a pre-save hook (or explicitly in the route). A `comparePassword(candidate)` instance method calls `bcrypt.compare(candidate, this.password)`.

**Cascade deletes:** When a user account is deleted (`DELETE /api/auth/account`), the route explicitly deletes all `Quiz` and `Session` documents where `host === user._id` before deleting the user.

---

### Quiz Model

**File:** `models/Quiz.js`  
**Collection:** `quizzes`

```
Quiz {
  host:         ObjectId  (ref: 'User', required, indexed)
  title:        String    (required, trimmed, max 120 chars)
  description:  String    (optional, max 300 chars)
  timerMode:    String    (enum: ['per-question', 'quiz'], default: 'per-question')
  quizTimeLimit: Number   (5–300 seconds, only used when timerMode === 'quiz')
  questions: [
    {
      text:         String   (required, max 500 chars)
      options:      [String] (2–4 items, each max 200 chars)
      correctIndex: Number   (0–3, required)
      timeLimit:    Number   (5–120 seconds, only used when timerMode === 'per-question')
    }
  ]
  createdAt: Date  (auto)
  updatedAt: Date  (auto)
}
```

**Validation rules enforced server-side:**
- `questions` array: minimum 1, maximum 25 items.
- Each question must have 2–4 options.
- `correctIndex` must be a valid index within `options`.
- `timerMode === 'quiz'` requires `quizTimeLimit` to be set.
- `timerMode === 'per-question'` requires each question to have a `timeLimit`.

**Authorization:** Every quiz route verifies `quiz.host.toString() === req.user.id` before allowing read/write/delete. A host can only access their own quizzes.

---

### Session Model

**File:** `models/Session.js`  
**Collection:** `sessions`

```
Session {
  host:       ObjectId  (ref: 'User', required, indexed)
  quiz:       ObjectId  (ref: 'Quiz', required)
  roomCode:   String    (6 chars, uppercase, unique, indexed)
  status:     String    (enum: ['waiting', 'live', 'ended'], default: 'waiting')
  players: [
    {
      playerId:   String  (UUID, required)
      name:       String  (sanitized, max 30 chars)
      score:      Number  (default: 0)
      active:     Boolean (default: true)
      lastJoinedAt: Date  (auto)
    }
  ]
  voteSnapshots: [
    {
      questionIndex: Number
      votes:         [Number]   (count per option)
    }
  ]
  currentIndex: Number    (0-indexed)
  questionOpenedAt: Date  (set when question is broadcast)
  startedAt:  Date        (set when status → 'live')
  endedAt:    Date        (set when status → 'ended')
  createdAt:  Date        (auto, TTL index: 90 days)
  updatedAt:  Date        (auto)
}
```

**Indexes:** `roomCode` (unique) for fast room validation. `host` for session history queries.

**`players` subdocument:** Players are stored as embedded subdocuments — not references — because player identity is session-scoped (no account needed). The `playerId` field is a client-generated UUID persisted in the player's localStorage for reconnection.

**`questionStats`:** Populated after each question is revealed. Used by `ResultsPage` to show per-question analytics.

---

### Otp Model

**File:** `models/Otp.js`  
**Collection:** `otps`

```
Otp {
  email:     String  (required, lowercase)
  hash:      String  (bcrypt hash of the 6-digit OTP)
  attempts:  Number  (default: 0, max: 5)
  createdAt: Date    (TTL index: expires after 600 seconds / 10 minutes)
}
```

**TTL Index:** MongoDB automatically deletes expired OTP documents. `createdAt` has a TTL index of `600` seconds so unverified OTPs are cleaned up without manual cron jobs.

**Security:** The raw OTP is never stored — only the bcrypt hash. Each verification attempt increments `attempts`. At 5 failed attempts, all subsequent verifications for that email are rejected even if the OTP is correct.

---

## REST API Reference

All routes under `/api/auth/profile`, `/api/quiz`, `/api/session`, and `/api/export` require a valid JWT cookie unless noted otherwise. The `protect` middleware (see [JWT Auth Middleware](#jwt-auth-middleware)) handles this automatically when applied to a router.

---

### Auth Routes — `/api/auth`

**Router file:** `routes/auth.js`

#### `POST /api/auth/register/initiate`

Initiates email OTP registration.

**Auth:** None  
**Rate limit:** 5 requests / 15 min per IP

**Request body:**
```json
{ "name": "Alice", "email": "alice@example.com", "password": "secret123" }
```

**Logic:**
1. Validates name (required), email (valid format), password (min 6 chars).
2. Checks if `email` already exists in `User` collection → `400 Email already registered`.
3. Deletes any existing `Otp` document for this email (prevents stale OTP attacks).
4. Generates a cryptographically random 6-digit OTP: `crypto.randomInt(100000, 999999).toString()`.
5. Hashes the OTP with `bcrypt.hash(otp, 10)`.
6. Saves a new `Otp` document with the hash and `attempts: 0`.
7. Calls `emailService.sendOtp(email, otp)` to deliver the raw OTP via Nodemailer.
8. Temporarily stores `{ name, hashedPassword }` in the `Otp` document (not a separate store) for use during verification.

**Response `200`:**
```json
{ "message": "OTP sent to your email." }
```

**Response `400`:**
```json
{ "error": "Email already registered." }
```

---

#### `POST /api/auth/register/verify`

Verifies the OTP and creates the user account.

**Auth:** None

**Request body:**
```json
{ "email": "alice@example.com", "otp": "847291" }
```

**Logic:**
1. Finds the `Otp` document for the given email. If not found → `400 OTP expired or not requested`.
2. Checks `attempts >= 5` → `400 Too many attempts`.
3. Calls `bcrypt.compare(otp, otpDoc.hash)`. Increments `attempts` on mismatch → returns remaining attempts.
4. On match: creates `User` document with stored name and hashed password. Deletes the `Otp` document.
5. Signs a JWT: `jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' })`.
6. Sets the JWT as an `httpOnly`, `sameSite: 'lax'`, `secure` (in production) cookie named `token`.
7. Returns the user object (without password).

**Response `200`:**
```json
{ "user": { "id": "...", "name": "Alice", "email": "alice@example.com" } }
```
Cookie set: `token=<jwt>; HttpOnly; Path=/; Max-Age=604800`

**Response `400` (wrong OTP):**
```json
{ "error": "Incorrect OTP. 2 attempts remaining." }
```

---

#### `POST /api/auth/register/resend`

Re-sends a new OTP for a pending registration.

**Auth:** None  
**Rate limit:** 3 requests / 15 min per IP

**Request body:** `{ "email": "alice@example.com" }`

**Logic:** Deletes the existing `Otp` document, generates a new OTP, hashes and saves it, sends the email.

**Response `200`:** `{ "message": "New OTP sent." }`

---

#### `POST /api/auth/login`

**Auth:** None  
**Rate limit:** 10 requests / 15 min per IP

**Request body:**
```json
{ "email": "alice@example.com", "password": "secret123" }
```

**Logic:**
1. Finds user by email (`.select('+password')` to include the hash field).
2. `user.comparePassword(password)` → `401 Invalid credentials` on mismatch.
3. Signs JWT, sets `httpOnly` cookie, returns user object (without password).

**Response `200`:**
```json
{ "user": { "id": "...", "name": "Alice", "email": "alice@example.com" } }
```

---

#### `POST /api/auth/logout`

**Auth:** None (cookie is present; server clears it)

**Logic:** Sets the `token` cookie to an empty string with `maxAge: 0`, effectively deleting it.

**Response `200`:** `{ "message": "Logged out." }`

---

#### `GET /api/auth/me`

Returns the currently authenticated user's profile.

**Auth:** ✅ JWT cookie

**Logic:** Reads `req.user.id` set by `protect` middleware. Queries `User.findById(id).select('-password')`.

**Response `200`:**
```json
{ "user": { "id": "...", "name": "Alice", "email": "alice@example.com", "createdAt": "..." } }
```

---

#### `PATCH /api/auth/profile`

Updates name and/or email.

**Auth:** ✅ JWT cookie

**Request body:** `{ "name": "Alice Updated", "email": "newemail@example.com" }` (either field optional)

**Logic:**
1. Validates that the new email is not already taken by another user.
2. Updates the user document.
3. Re-issues the JWT cookie (in case email changed, the payload should stay current).
4. Returns the updated user.

**Response `200`:** `{ "user": { ... } }`

---

#### `POST /api/auth/profile/change-password`

**Auth:** ✅ JWT cookie

**Request body:** `{ "currentPassword": "...", "newPassword": "..." }`

**Logic:** Verifies `currentPassword` against the stored hash, then updates `user.password` with the new bcrypt hash.

**Response `200`:** `{ "message": "Password updated." }`  
**Response `401`:** `{ "error": "Current password is incorrect." }`

---

#### `DELETE /api/auth/account`

Permanently deletes the account and all associated data.

**Auth:** ✅ JWT cookie

**Request body:** `{ "password": "..." }` (password confirmation required)

**Logic:**
1. Verifies password.
2. Deletes all `Session` documents where `host === user._id`.
3. Deletes all `Quiz` documents where `host === user._id`.
4. Deletes the `User` document.
5. Clears the JWT cookie.

**Response `200`:** `{ "message": "Account deleted." }`

---

### Quiz Routes — `/api/quiz`

**Router file:** `routes/quiz.js`  
**Auth:** All routes require ✅ JWT cookie

#### `GET /api/quiz`

Returns all quizzes owned by the authenticated host.

**Logic:** `Quiz.find({ host: req.user.id }).sort({ createdAt: -1 })` — newest first.

**Response `200`:**
```json
{ "quizzes": [ { "id": "...", "title": "...", "description": "...", "questionCount": 10, "createdAt": "..." } ] }
```

Note: The `questions` array is not returned in the list view — only metadata — to keep payloads small.

---

#### `GET /api/quiz/:id`

Returns a single quiz with all questions.

**Logic:** `Quiz.findById(id)`. Verifies `quiz.host === req.user.id` → `403 Forbidden`.

**Response `200`:** `{ "quiz": { ...allFields } }`

---

#### `POST /api/quiz`

Creates a new quiz.

**Request body:**
```json
{
  "title": "My Quiz",
  "description": "Optional description",
  "timerMode": "per-question",
  "questions": [
    {
      "text": "What is 2 + 2?",
      "options": ["3", "4", "5", "6"],
      "correctIndex": 1,
      "timeLimit": 15
    }
  ]
}
```

**Validation:**
- `title`: required, max 120 chars.
- `questions`: 1–25 items.
- Each question: `text` required, 2–4 `options`, valid `correctIndex`, `timeLimit` (5–120) if `timerMode === 'per-question'`.
- `quizTimeLimit` (5–300) required if `timerMode === 'quiz'`.

**Response `201`:** `{ "quiz": { ...createdQuiz } }`

---

#### `PUT /api/quiz/:id`

Full replacement update of a quiz. Same validation as `POST /api/quiz`.

**Auth check:** `quiz.host === req.user.id`

**Response `200`:** `{ "quiz": { ...updatedQuiz } }`

---

#### `DELETE /api/quiz/:id`

Deletes a quiz. Also deletes all `Session` documents referencing this quiz to prevent orphaned sessions.

**Auth check:** `quiz.host === req.user.id`

**Response `200`:** `{ "message": "Quiz deleted." }`

---

### Session Routes — `/api/session`

**Router file:** `routes/session.js`

#### `POST /api/quiz/:quizId/session`

Creates a new live session for a quiz.

**Auth:** ✅ JWT cookie

**Logic:**
1. Fetches the quiz. Verifies host ownership.
2. Checks for an existing `waiting` or `live` session for the same quiz → `409 Session already active`.
3. Generates a unique 6-character room code via `roomCode.generate()`.
4. Creates a `Session` document with `status: 'waiting'`, `roomCode`, `host`, `quiz`.
5. Returns `{ sessionId, roomCode }`.

**Response `201`:**
```json
{ "sessionId": "...", "roomCode": "3X7KFB" }
```

---

#### `GET /api/session/:roomCode`

Validates that a room exists and is joinable. Used by players on the JoinPage.

**Auth:** None (public endpoint)

**Logic:** `Session.findOne({ roomCode })`. Returns session status and basic metadata.

**Response `200`:**
```json
{ "sessionId": "...", "roomCode": "3X7KFB", "status": "waiting", "quizTitle": "My Quiz" }
```

**Response `404`:** `{ "error": "Room not found." }`

---

#### `GET /api/session/:roomCode/verify-host`

Confirms the authenticated user owns the session for a given room code. Used by `HostLobby` and `HostLive` on mount.

**Auth:** ✅ JWT cookie

**Response `200`:** `{ "ok": true, "status": "waiting", "sessionId": "..." }`  
**Response `403`:** `{ "error": "Forbidden." }`  
**Response `404`:** `{ "error": "Session not found." }`

---

#### `GET /api/session/mine`

Returns the host's current active (non-ended) session, if one exists. Used by `useSessionGuard` for host session recovery.

**Auth:** ✅ JWT cookie

**Logic:** `Session.findOne({ host: req.user.id, status: { $ne: 'ended' } })`.

**Response `200`:** `{ "session": { roomCode, status, sessionId } }` or `{ "session": null }`.

---

#### `GET /api/session/history`

Returns a paginated list of all sessions (all statuses) for the authenticated host, newest first.

**Auth:** ✅ JWT cookie
**Query Params:** `?page=N` (default: 1)

**Logic:** `Session.find({ host: req.user.id }).populate('quiz', 'title').sort({ createdAt: -1 }).skip(skip).limit(limit).lean()`.

**Response `200`:**
```json
{
  "page": 1,
  "totalPages": 5,
  "totalSessions": 98,
  "sessions": [
    {
      "sessionId": "...",
      "roomCode": "3X7KFB",
      "quizTitle": "My Quiz",
      "status": "ended",
      "playerCount": 12,
      "startedAt": "...",
      "endedAt": "...",
      "createdAt": "..."
    }
  ]
}
```

---

#### `GET /api/session/:sessionId/results`

Returns the full results for a completed session.

**Auth:** ✅ JWT cookie

**Logic:**
1. `Session.findById(sessionId).populate('quiz')`.
2. Verifies `session.host === req.user.id`.
3. Sorts `session.players` by score descending to build the leaderboard.
4. Returns players, questionStats, and quiz metadata.

**Response `200`:**
```json
{
  "session": { "roomCode": "...", "status": "ended", "startedAt": "...", "endedAt": "..." },
  "quiz": { "title": "...", "questions": [...] },
  "leaderboard": [ { "rank": 1, "name": "Alice", "score": 2400, "playerId": "..." } ],
  "questionStats": [
    { "questionIndex": 0, "votes": [2, 10, 3, 1], "correctIndex": 1, "accuracy": 62.5 }
  ]
}
```

---

#### `DELETE /api/session/:sessionId`

Deletes a session record from history.

**Auth:** ✅ JWT cookie  
**Constraint:** Cannot delete an active (`waiting` or `live`) session.

**Response `200`:** `{ "message": "Session deleted." }`  
**Response `400`:** `{ "error": "Cannot delete an active session." }`

---

### Export Routes — `/api/export`

**Router file:** `routes/export.js`  
**Auth:** All routes require ✅ JWT cookie

#### `GET /api/export/:sessionId/pdf`

Generates and streams a PDF report for a completed session.

**Query params:** `?quality=high` (Puppeteer) or `?quality=standard` (PDFKit, default).

**Logic:**
1. Fetches session and verifies host ownership.
2. If `ENABLE_PUPPETEER=true` and `quality=high`: calls `pdfService.generateWithPuppeteer(session)`.
3. Otherwise: calls `pdfService.generateWithPdfKit(session)`.
4. On Puppeteer failure when `fallbackAvailable=true`: returns `{ error: 'pdf_quality_failed', fallbackAvailable: true }` so the client can prompt the user to retry with PDFKit.
5. Streams the PDF buffer as `application/pdf` with `Content-Disposition: attachment; filename="..."`.

**Response `200`:** Binary PDF stream  
**Response `400`:** `{ "error": "pdf_quality_failed", "fallbackAvailable": true }` (Puppeteer failure with fallback available)

---

## Middleware

### JWT Auth Middleware

**File:** `middleware/auth.js`

Applied to all protected routes via `router.use(protect)`.

```js
async function protect(req, res, next) {
  const token = req.cookies.token
  if (!token) return res.status(401).json({ error: 'Not authenticated.' })
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.user = await User.findById(decoded.id).select('-password')
    if (!req.user) return res.status(401).json({ error: 'User not found.' })
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' })
  }
}
```

`req.user` is populated for all downstream route handlers. The JWT payload only contains `{ id }` — the user document is always fetched fresh to reflect any account changes.

---

### Helmet (Security Headers)

Applied globally in `server.js` via `app.use(helmet())`. Sets:

- `Content-Security-Policy`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security` (in production)
- `X-XSS-Protection`

---

### Rate Limiting

**Package:** `express-rate-limit`

Applied per-route group. The server is configured with `app.set('trust proxy', 1)` to correctly parse `X-Forwarded-For` headers when deployed behind reverse proxies like ngrok or Render, ensuring accurate rate limiting.

| Route Group | Limit | Window |
|-------------|-------|--------|
| `POST /api/auth/register/initiate` | 5 requests | 15 min |
| `POST /api/auth/register/resend` | 3 requests | 15 min |
| `POST /api/auth/login` | 10 requests | 15 min |
| Global API fallback | 100 requests | 15 min |

Responses when limit exceeded return `429 Too Many Requests` with a JSON error message.

---

### CORS

**Package:** `cors`

The `CLIENT_URL` environment variable is split on commas to produce a list of allowed origins. This allows multiple origins (e.g. Vercel preview URLs + production URL).

```js
const allowedOrigins = process.env.CLIENT_URL.split(',').map(o => o.trim())
app.use(cors({
  origin: (origin, cb) => allowedOrigins.includes(origin) ? cb(null, true) : cb(new Error('CORS')),
  credentials: true   // Required for httpOnly cookie transport
}))
```

Socket.io CORS is configured identically on the `Server` constructor.

---

### asyncHandler

**File:** `utils/asyncHandler.js`

A higher-order function that wraps async route handlers and forwards any thrown error to Express's `next(err)`:

```js
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
```

Used on every route to avoid repetitive `try/catch` blocks.

---

## WebSocket Layer — Socket.io

**File:** `socket/quizSocket.js`

This is the most complex module in the codebase. It manages all real-time session state in memory during live sessions and persists results to MongoDB at the end.

### Socket Architecture

`quizSocket(io)` is called once from `server.js` with the Socket.io `io` instance. It registers a `connection` event handler that sets up per-socket listeners. All active sessions share the same server-side room namespace — each session has a unique `roomCode` that maps directly to a Socket.io room.

**Host sockets** are authenticated: the Socket.io handshake includes the `httpOnly` JWT cookie. A `protect`-equivalent middleware runs on the WebSocket connection to populate `socket.user`.

**Player sockets** are unauthenticated. Player identity is established by the `playerId` field sent in the `player:join` payload.

---

### In-Memory Room State

All active session state is kept in a `Map<roomCode, RoomState>` object for O(1) lookup:

```js
const rooms = new Map()

// RoomState shape:
{
  sessionId:       String,           // MongoDB session _id
  hostSocketId:    String,           // socket.id of the host
  quiz:            Object,           // full populated quiz document
  currentIndex:    Number,           // index of current question (0-based)
  status:          String,           // 'waiting' | 'live' | 'revealing' | 'ended'
  timerInterval:   NodeJS.Timer,     // setInterval reference for countdown
  timeRemaining:   Number,           // seconds remaining on current question
  answerStart:     Number,           // Date.now() when question was broadcast
  votes:           Number[],         // [count per option] for current question
  answeredPlayers: Set<playerId>,    // who has answered this question
  pointsMap:       Map<playerId, N>, // points earned this round per player
  players:         Map<playerId, {   // all players (including disconnected)
    name, socketId, score, active
  }>
}
```

The `rooms` Map is the **authoritative source of truth** during a live session. MongoDB is only written to at session end and after each question reveal (for `questionStats`).

---

### Session State Machine

A session transitions through states in a strict order. Invalid transitions are silently ignored.

```
waiting
  │
  └─ quiz:start ──────────────────────────► live (question N broadcasting)
                                              │
                                 player answers / timer ticks
                                              │
                     quiz:reveal (host) OR timer → 0 ──► revealing
                                              │
                                          quiz:next ──► live (question N+1)
                                              │
                                   (last question revealed)
                                              │
                                           quiz:end ──► ended
```

The `status` field on the in-memory `RoomState` is the gating condition for all state transitions. For example, `player:answer` is rejected if `status !== 'live'`.

---

### Socket Event Handlers — Host

#### `host:join`

**Payload:** `{ roomCode }`

1. Verifies the authenticated `socket.user` owns the session via `Session.findOne({ roomCode, host: socket.user._id })`. Disconnects on failure.
2. Populates the room in the `rooms` Map if not already present (creates the `RoomState`).
3. Sets `room.hostSocketId = socket.id`.
4. Joins the Socket.io room: `socket.join(roomCode)`.
5. Emits `host:joined` to the host with the current room state: `{ roomCode, status, players: [...], currentQuestion }`. The `currentQuestion` is included for reconnect scenarios.

---

#### `quiz:start`

**Payload:** `{ roomCode }`

**Guard:** `room.status !== 'waiting'` → ignored.

1. Sets `room.status = 'live'`, `room.currentIndex = 0`.
2. Updates `Session.status = 'live'`, `Session.startedAt = new Date()`.
3. Calls `broadcastQuestion(io, room, roomCode)` (see [Timer Logic](#timer-logic)).

---

#### `quiz:reveal`

**Payload:** `{ roomCode }`

**Guard:** `room.status !== 'live'` → ignored.

1. Clears the timer interval.
2. Calls `revealAnswer(io, room, roomCode)` (see below).

---

#### `quiz:next`

**Payload:** `{ roomCode }`

**Guard:** `room.status !== 'revealing'` → ignored.

1. Increments `room.currentIndex`.
2. If `currentIndex >= quiz.questions.length`: calls `endSession(io, room, roomCode)`.
3. Otherwise: calls `broadcastQuestion(io, room, roomCode)`.

---

#### `quiz:end`

**Payload:** `{ roomCode }`

Calls `endSession(io, room, roomCode)` regardless of current state.

---

#### `host:cancel`

**Payload:** `{ roomCode }`

1. Clears the timer interval.
2. Broadcasts `session_canceled` to all players in the room.
3. Deletes the `Session` from MongoDB.
4. Deletes the entry from the `rooms` Map.
5. Removes all sockets from the Socket.io room.

---

### Socket Event Handlers — Player

#### `player:join`

**Payload:** `{ roomCode, playerName, playerId }`

**Sanitization:** `playerName` is passed through `sanitize-html(name, { allowedTags: [] })` and trimmed to 24 characters to prevent XSS.

1. Validates the room exists in the `rooms` Map. If not → `error: 'Room not found'`.
2. Checks `room.status !== 'ended'`. If ended → `error: 'Session has ended'`.
3. Checks if `playerId` already exists in `room.players` (reconnect case):
   - If reconnecting: updates `socketId`, sets `active: true`. Restores their score.
   - If new: adds to `room.players` Map and to `Session.players` array (via MongoDB push).
4. Joins the Socket.io room: `socket.join(roomCode)`.
5. Emits `player:joined` to the player: `{ roomCode, quizTitle, status, currentQuestion, score }`.
6. Broadcasts `room:players` to all room members (host sees updated player count).

---

#### `player:answer`

**Payload:** `{ roomCode, questionIndex, optionIndex, playerId }`

**Guards:**
- `room.status !== 'live'` → ignored.
- `questionIndex !== room.currentIndex` → ignored (stale answer from previous question).
- `room.answeredPlayers.has(playerId)` → ignored (duplicate answer).

1. Marks `room.answeredPlayers.add(playerId)`.
2. Increments `room.votes[optionIndex]`.
3. Calculates points:
   ```js
   const elapsed = (Date.now() - room.answerStart) / 1000
   const timeLimit = currentQuestion.timeLimit
   const correct = optionIndex === currentQuestion.correctIndex
   const points = correct ? 500 + Math.floor((1 - elapsed / timeLimit) * 500) : 0
   ```
4. Stores `room.pointsMap.set(playerId, points)`.
5. Emits `answer:received` back to the answering player only: `{ questionIndex, optionIndex }`.
6. Emits `quiz:stats` to the host socket: `{ votes, totalAnswered, totalPlayers }`.
7. If all active players have answered: auto-calls `revealAnswer()`.

---

#### `player:leave`

**Payload:** `{ roomCode, playerId }`

Sets `room.players.get(playerId).active = false`. Broadcasts updated player list to host.

---

### Timer Logic

**`broadcastQuestion(io, room, roomCode)`**

1. Gets the current question from `room.quiz.questions[room.currentIndex]`.
2. Resolves the `timeLimit`: uses `question.timeLimit` if `timerMode === 'per-question'`, or `quiz.quizTimeLimit` if `timerMode === 'quiz'`.
3. Resets `room.votes`, `room.answeredPlayers`, `room.pointsMap`, `room.timeRemaining`, `room.answerStart = Date.now()`.
4. Broadcasts `quiz:question` to the entire room: `{ index, totalQuestions, text, options, timeLimit }`.
5. Starts a `setInterval` of 1000ms:
   - Each tick: decrements `room.timeRemaining`, emits `timer:tick` to the room: `{ remaining }`.
   - When `timeRemaining <= 0`: clears the interval, calls `revealAnswer()`.

**`revealAnswer(io, room, roomCode)`**

1. Sets `room.status = 'revealing'`.
2. Builds the final leaderboard by sorting `room.players` Map by score descending. Computes `rankChange` per player by comparing with previous round's ranks.
3. Applies `pointsMap` scores to each player in `room.players` (updates in-memory score).
4. Persists `questionStats` for this question to the MongoDB `Session` document.
5. Updates all player scores in the `Session.players` subdocument array.
6. Broadcasts `quiz:result` to the entire room: `{ correctIndex, votes, leaderboard, pointsMap, questionIndex }`.

The `pointsMap` is a plain object `{ [playerId]: pointsThisRound }` so each player's game screen can look up their own points earned.

**`endSession(io, room, roomCode)`**

1. Sets `room.status = 'ended'`.
2. Updates `Session.status = 'ended'`, `Session.endedAt = new Date()`.
3. Broadcasts `quiz:ended` to the entire room: `{ finalLeaderboard, sessionId }`.
4. Clears the rooms Map entry after a short delay (30 seconds) to allow reconnecting players to receive the ended event.

---

### Socket Event Reference

#### Events Emitted by Server

| Event | Recipient | Payload | When |
|-------|-----------|---------|------|
| `host:joined` | Host only | `{ roomCode, status, players, currentQuestion }` | On `host:join` |
| `player:joined` | Player only | `{ roomCode, quizTitle, status, currentQuestion, score }` | On `player:join` |
| `room:players` | Entire room | `{ count, players }` | Player joins/leaves |
| `quiz:question` | Entire room | `{ index, totalQuestions, text, options, timeLimit }` | New question broadcast |
| `quiz:stats` | Host only | `{ votes, totalAnswered, totalPlayers }` | Each player answers |
| `quiz:result` | Entire room | `{ correctIndex, votes, leaderboard, pointsMap, questionIndex }` | Answer revealed |
| `timer:tick` | Entire room | `{ remaining }` | Every second during question |
| `quiz:ended` | Entire room | `{ finalLeaderboard, sessionId }` | Session ends |
| `answer:received` | Player only | `{ questionIndex, optionIndex }` | Server confirms answer |
| `session_canceled` | Entire room | — | Host cancels session |
| `host:disconnected` | Players | `{ message }` | Host socket disconnects |
| `error` | Socket only | `{ message }` | Invalid action attempted |

#### Events Received by Server

| Event | Payload | Handler |
|-------|---------|---------|
| `host:join` | `{ roomCode }` | Join/rejoin host room |
| `player:join` | `{ roomCode, playerName, playerId }` | Join/rejoin as player |
| `player:leave` | `{ roomCode, playerId }` | Mark player inactive |
| `player:answer` | `{ roomCode, questionIndex, optionIndex, playerId }` | Submit answer |
| `quiz:start` | `{ roomCode }` | Start the quiz |
| `quiz:reveal` | `{ roomCode }` | Manually reveal answer |
| `quiz:next` | `{ roomCode }` | Advance to next question |
| `quiz:end` | `{ roomCode }` | End session |
| `host:cancel` | `{ roomCode }` | Cancel and delete session |
| `disconnect` | — | Handle socket drop |

---

## Business Logic & Services

### Scoring Algorithm

**File:** `socket/quizSocket.js` — inside `player:answer` handler

```
Base points:    500  (for a correct answer)
Speed bonus:    up to 500 additional points

Formula:
  elapsed = (Date.now() - room.answerStart) / 1000   // seconds since question broadcast
  speedBonus = Math.floor((1 - elapsed / timeLimit) * 500)
  points = correct ? 500 + speedBonus : 0
```

- A player who answers **instantly** earns ~1000 points.
- A player who answers **at the very last second** earns ~500 points.
- A player who answers **incorrectly** earns 0 points regardless of speed.
- Speed bonus is **clamped**: if `elapsed > timeLimit` (edge case from network lag), the bonus is 0, not negative.

Points are calculated during the **Reveal Phase** using an optimized aggregation-based approach (see [Performance Optimizations](#performance-optimizations)).

Points are accumulated in `session.players[index].score` and persisted to the database once per question.

---

### PDF Generation Service

**File:** `services/pdfService.js`

Exports two functions: `generateWithPuppeteer(session)` and `generateWithPdfKit(session)`.

**`generateWithPuppeteer(session)`:**
1. Builds an HTML string representing the full results report (inline CSS, no external resources).
2. Launches a Puppeteer browser instance in headless mode.
3. Sets the page content and waits for network idle.
4. Calls `page.pdf({ format: 'A4', printBackground: true })`.
5. Returns the PDF `Buffer`.
6. Always closes the browser in a `finally` block.

Only available when `ENABLE_PUPPETEER=true`. Disabled by default because Puppeteer requires ~300MB of disk space and 512MB+ RAM, which exceeds Render's free tier.

**`generateWithPdfKit(session)`:**
1. Creates a `PDFDocument` with A4 dimensions.
2. Programmatically draws text, lines, rectangles for the results layout.
3. Includes: session metadata header, leaderboard table, per-question breakdown with vote bars.
4. Returns a `Buffer` by piping the document to a `concat-stream` or accumulating chunks.

PDFKit produces vector PDF without launching a browser, making it suitable for low-resource environments. Both services are optimized to handle both Mongoose documents and `.lean()` plain objects via duck-typing checks for `.toObject()`.

**Resiliency:** If high-quality generation fails (e.g. due to OOM), the server returns a `pdf_quality_failed` error, prompting the client to automatically retry using the standard PDFKit generator.

---

### OTP Service

**Internal to** `routes/auth.js`

OTP generation uses `crypto.randomInt(100000, 999999)` — a cryptographically secure integer from Node's built-in `crypto` module (not `Math.random()`).

OTP hashing uses `bcrypt.hash(otp.toString(), 10)` with cost factor 10 (fast enough for 6-digit verification but secure against brute force via the attempt counter).

---

### Email Service (Nodemailer)

**File:** `services/emailService.js`

Uses a single Nodemailer transporter configured for Gmail SMTP:

```js
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
})
```

`SMTP_PASS` must be a **Gmail App Password**, not the account password. App Passwords are generated in Google Account → Security → 2-Step Verification → App Passwords.

**`sendOtp(to, otp)`** sends an HTML email with the OTP in a visually styled template. The `from` address is set to the `SMTP_USER`.

The transporter is created once at module load (not per-request) to reuse the SMTP connection.

---

## Utils

### roomCode Generator

**File:** `utils/roomCode.js`

```js
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // excludes O, 0, I, 1 (ambiguous)

function generate() {
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)]
  }
  return code
}
```

Generates a 6-character alphanumeric code. Ambiguous characters (`O`, `0`, `I`, `1`) are excluded to reduce player entry errors.

**Collision handling:** `POST /api/quiz/:quizId/session` generates a code, then checks `Session.exists({ roomCode })`. On collision (extremely rare), it regenerates. In practice, the keyspace (~28^6 ≈ 480 million) makes collisions negligible for normal usage.

---

### DB Helpers

**File:** `utils/db.js`

Exports a `connectDB()` function that calls `mongoose.connect(MONGODB_URI)` with standard options. Called once from `server.js` during startup. Mongoose's built-in connection pooling handles concurrent requests.

---

## Security Implementation

| Concern | Implementation |
|---------|---------------|
| **Password storage** | `bcryptjs` with cost factor 12 |
| **JWT storage** | `httpOnly` cookie — inaccessible to JavaScript |
| **JWT expiry** | 7 days (`expiresIn: '7d'`) |
| **Cookie flags** | `httpOnly: true`, `secure: true` (production), `sameSite: 'lax'` |
| **OTP brute force** | Max 5 attempts tracked in MongoDB; blocked after limit |
| **OTP expiry** | 10-minute TTL via MongoDB TTL index |
| **OTP entropy** | `crypto.randomInt()` — cryptographically secure |
| **XSS (player names)** | `sanitize-html` strips all tags before storage |
| **Auth headers** | `helmet()` sets CSP, HSTS, X-Frame-Options, etc. |
| **Rate limiting** | Per-IP limits on auth endpoints |
| **CORS** | Allowlist from `CLIENT_URL` env var only |
| **Authorization** | Every quiz/session route verifies resource ownership against `req.user.id` |
| **Host WebSocket auth** | JWT cookie verified on Socket.io handshake |

---

## Error Handling Strategy

All route handlers are wrapped with `asyncHandler`. A global Express error handler at the bottom of `server.js` catches all unhandled errors:

```js
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500
  const message = process.env.NODE_ENV === 'production'
    ? (status < 500 ? err.message : 'Internal server error')
    : err.message
  res.status(status).json({ error: message })
})
```

In production, 5xx error messages are hidden from clients to prevent information leakage. 4xx messages (validation, auth errors) are returned as-is because they are intentional user-facing feedback.

**Mongoose validation errors** (`err.name === 'ValidationError'`) are caught and reformatted to extract the `message` fields from the `errors` object before being sent to the client.

**Socket errors** are handled per-event by emitting `{ event: 'error', data: { message } }` directly to the offending socket rather than crashing the process.

---

## Observability & Logging

- **Structured Logging (`pino`)**: Replaces global `console.log` with a centralized Pino logger (`utils/logger.js`). Provides structured JSON logs, better performance, and log levels controlled by the `LOG_LEVEL` environment variable.
- **Error Tracking (`@sentry/node`)**: Sentry is integrated into the global Express error handler to capture unhandled exceptions automatically. Requires `SENTRY_DSN`.

---

## Performance Optimizations

To handle high-concurrency sessions (100+ players) without latency degradation, the backend implements several low-level optimizations:

### 1. MongoDB Aggregation Pipeline
In the **Reveal Phase**, the server must fetch and process player responses. Traditional `find()` and in-memory filtering scale poorly as the `responses` array grows across questions.
- **Solution**: Uses `Session.aggregate` with `$unwind` and `$match` to fetch **only** the responses for the current question directly from the database. This resolves the $O(N)$ filtering bottleneck in Node.js.

### 2. O(1) Player Lookups
Instead of repeatedly calling `.find()` on the `session.players` array (which is $O(M)$ where M is player count), the server builds a temporary `Map` ($O(1)$ lookup) during the scoring phase.
- **Complexity**: Reduces scoring from $O(R \times M)$ to $O(R)$, where R is the number of responses.

### 3. Positional Atomic Updates (`bulkWrite`)
Updating hundreds of response subdocuments individually would normally require re-saving the entire `session` document, which can be several megabytes for large quizzes.
- **Solution**: Uses `Session.bulkWrite()` with targeted `$set` operations on `responses.$.isCorrect` and `responses.$.pointsAwarded`. This allows MongoDB to update only the modified fields in place without rewriting the entire document.

### 4. O(1) Map-Based Lookups
Previously, retrieving vote snapshots or matching responses during results processing used nested `.find()` or `.filter()` calls inside loops, resulting in $O(N^2)$ complexity.
- **Solution**: Implemented `snapshotMap = new Map(snapshots.map(v => [v.questionIndex, v]))`. 
- **Impact**: All snapshot lookups in the results route and PDF services are now $O(1)$, ensuring stable performance even for quizzes with 50+ questions and hundreds of votes.

### 5. Read-Only Optimization (`.lean()`)
Most GET requests only require data for serialization and do not need Mongoose's "Change Tracking" or "Virtuals."
- **Solution**: Applied `.lean()` to all read-only queries in `quiz`, `session`, and `export` routes.
- **Impact**: Reduces memory overhead per request and speeds up serialization by skipping the overhead of Mongoose document hydration.

### 6. Room Code Collision Guard
The room code generation loop is optimized to handle rare collisions by checking existence in the database before allocation, while ensuring the loop is finite to prevent hang conditions.

---
---

## Testing

**Files:** `test/routes/auth.test.js`, `test/routes/quiz.test.js`, `test/socket/quizSocket.test.js`

Tests use **Jest** and require a dedicated test database (local or Atlas) defined by `TEST_MONGODB_URI`. 

**Setup (Global Test Guard):**
To prevent accidental deletion of production data, the test suite uses `test/helpers/jestGlobalSetup.js` which forcefully removes `MONGODB_URI` from the environment and ensures `TEST_MONGODB_URI` is used. A hard guard in `test/helpers/db.js` prevents tests from running against non-test Atlas clusters.

```js
// Shared DB setup in tests
beforeAll(() => db.connect())
afterAll(()  => db.disconnect())
afterEach(async () => {
  await db.clearCollections()
})
```

Tests use `supertest` to make HTTP requests against the Express app without starting a real server.

**Running tests:**
```bash
cd server
npm test              # run all tests once
npm test -- --watch   # watch mode
npm test -- --coverage  # with coverage report
```

---

## Deployment — Render

### Free Tier Setup

1. Create a **Web Service** in Render pointing to the GitHub repo.
2. Set **Root Directory** to `server`.
3. **Build command:** `npm install`
4. **Start command:** `npm start` (runs `node server.js`)
5. Add all environment variables from `.env.example` in the Render dashboard.
6. Set `ENABLE_PUPPETEER=false` (free tier has insufficient RAM for Chromium).

### Production Considerations

- Set `NODE_ENV=production` — enables secure cookies, hides 5xx error details.
- Set `CLIENT_URL` to your Vercel frontend URL.
- Render free tier spins down after 15 min of inactivity (cold start ~30s). Upgrade to a paid tier for production use.
- MongoDB Atlas free tier (M0) has a 512MB storage limit and connection count cap — sufficient for development and light production use.

---

## Development Setup

```bash
# From the repository root
cd server
npm install

# Create and fill .env
cp .env.example .env

# Start with hot-reload
npm run dev   # nodemon watches src/ for changes
# Server starts at http://localhost:5000
```

**Available scripts:**
```bash
npm run dev     # nodemon server.js
npm start       # node server.js (production)
npm test        # jest
```

The Vite dev server in `client/` proxies `/api` and `/socket.io` to `localhost:5000`, so both services must be running simultaneously for full-stack local development.
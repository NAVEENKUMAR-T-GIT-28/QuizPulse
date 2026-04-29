# QuizLive — Real-Time Quiz App
> MERN Stack · Socket.io · JWT Auth for hosts · No auth for players · PDF export

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Core Features](#2-core-features)
3. [System Architecture](#3-system-architecture)
4. [Tech Stack](#4-tech-stack)
5. [Authentication Design](#5-authentication-design)
6. [Folder Structure](#6-folder-structure)
7. [Database Schema](#7-database-schema)
8. [REST API Endpoints](#8-rest-api-endpoints)
9. [Socket.io Event Reference](#9-socketio-event-reference)
10. [Quiz State Machine](#10-quiz-state-machine)
11. [Real-Time Dashboard](#11-real-time-dashboard)
12. [QR Code Join Flow](#12-qr-code-join-flow)
13. [PDF Export](#13-pdf-export)
14. [Frontend Pages & Components](#14-frontend-pages--components)
15. [Build Order](#15-build-order)
16. [Environment Variables](#16-environment-variables)
17. [Deployment](#17-deployment)

---

## 1. Project Overview

QuizLive is a real-time interactive quiz platform inspired by Mentimeter. A **host** creates a quiz, shares a 6-character room code or QR code, and controls the session live. **Players** join anonymously with just a name — no account needed. The host sees a live dashboard as answers come in. At the end, the host can export full session results as a PDF.

### What makes this different from a basic quiz app

- Host auth (JWT) so hosts can log back in and manage their quizzes
- No auth friction for players — just a name and a room code
- Live bar chart updates on every answer without page refresh
- Server-owned timer so clients can't cheat
- PDF export of results that mirrors Mentimeter's report style
- QR code generation built into the host dashboard

---

## 2. Core Features

### Host (authenticated)

| Feature | Detail |
|---|---|
| Register / Login | JWT-based auth, bcrypt password hashing |
| Create quiz | Title, description, multiple questions with options and correct answer |
| Dashboard | All past quizzes with result history |
| Live session control | Start, advance slides, reveal answer, end session |
| Live stats view | Real-time bar chart per question as votes arrive |
| Leaderboard | Live ranking after each reveal |
| PDF export | Full session report — questions, vote breakdown, leaderboard |

### Player (no auth)

| Feature | Detail |
|---|---|
| Join by code | 6-char room code or QR code scan |
| Display name only | No account, no password, no email |
| Answer questions | Tap one option per question |
| See result | Correct/wrong + points after reveal |
| Leaderboard | Live rank after each round |

---

## 3. System Architecture

```
┌──────────────────────────────────────────────────┐
│                    Frontend                      │
│                                                  │
│   ┌─────────────┐        ┌──────────────────┐    │
│   │  Host App   │        │   Player App     │    │
│   │  (React)    │        │   (React)        │    │
│   └──────┬──────┘        └────────┬─────────┘    │
│          │   Socket.io client     │              │
└──────────┼────────────────────────┼──────────────┘
           │         HTTPS/WS       │
┌──────────┼────────────────────────┼──────────────┐
│          ▼        Backend         ▼              │
│   ┌─────────────────────────────────────────┐    │
│   │         Express + Socket.io             │    │
│   │                                         │    │
│   │  REST routes   │   Socket rooms         │    │
│   │  /api/auth     │   quizSocket.js        │    │
│   │  /api/quiz     │   - join/leave         │    │
│   │  /api/session  │   - events broadcast   │    │
│   │  /api/export   │   - vote aggregation   │    │
│   └──────────────────────┬──────────────────┘    │
│                          │                       │
└──────────────────────────┼───────────────────────┘
                           │
       ┌───────────────────▼────────────┐
       │         MongoDB Atlas          │
       │                                │
       │  users · quizzes · sessions    │
       └────────────────────────────────┘
```

### What uses WebSockets vs REST

| Action | Protocol | Why |
|---|---|---|
| Register / Login | REST | One-time, no persistence needed |
| Create / edit quiz | REST | Standard CRUD |
| Load past quizzes | REST | Standard read |
| Player joins room | WebSocket | Server needs to track live connection |
| Host starts session | WebSocket | Must broadcast to all players instantly |
| Player submits answer | WebSocket | Triggers live chart update on host |
| Host reveals answer | WebSocket | Must push to all players simultaneously |
| Export PDF | REST | Standard file download |

---

## 4. Tech Stack

### Backend

| Package | Purpose |
|---|---|
| `express` | HTTP server and REST routing |
| `socket.io` | WebSocket server, room management |
| `mongoose` | MongoDB ODM, schema validation |
| `jsonwebtoken` | JWT creation and verification |
| `bcryptjs` | Password hashing |
| `cors` | Cross-origin requests from Vercel frontend |
| `dotenv` | Environment variable loading |
| `nanoid` | Generate 6-char room codes |
| `puppeteer` | Headless Chrome for PDF generation |

### Frontend

| Package | Purpose |
|---|---|
| `react-router-dom` | Page routing (host vs player views) |
| `socket.io-client` | WebSocket connection to backend |
| `zustand` | Global state (quiz, players, scores) |
| `recharts` | Animated bar chart for live results |
| `qrcode.react` | QR code generation from room code |
| `axios` | HTTP requests for auth and quiz CRUD |

---

## 5. Authentication Design

### Why auth only for hosts

Mentimeter's model: the host is a professional who needs to save, reuse, and analyse their quizzes. The player is a one-time participant — adding auth would kill conversion. A player joining a quiz should take 10 seconds, not 2 minutes.

### JWT flow

```
Host registers/logs in
        │
        ▼
Server validates credentials
        │
        ▼
Server returns JWT (expires 7d)
        │
        ▼
Client stores in localStorage
        │
        ▼
All host API requests → Authorization: Bearer <token>
        │
        ▼
authMiddleware.js verifies token on protected routes
```

### authMiddleware.js

```js
const jwt = require('jsonwebtoken')

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'No token' })

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.user = decoded
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

module.exports = authMiddleware
```

### Player identity (no auth)

Players get a `playerId` generated client-side using `crypto.randomUUID()` stored in `sessionStorage`. This persists across page reloads within the same browser tab but not across devices. The player's display name and this ID are sent on `player:join`. The server trusts this for the duration of the session only.

---

## 6. Folder Structure

```
quizlive/
├── client/                          # React frontend (deploy to Vercel)
│   ├── public/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── LandingPage.jsx      # Home — "Host" or "Join" CTA
│   │   │   ├── AuthPage.jsx         # Host login / register
│   │   │   ├── HostDashboard.jsx    # All quizzes list
│   │   │   ├── QuizBuilder.jsx      # Create/edit quiz
│   │   │   ├── HostLobby.jsx        # Waiting room, QR code, player list
│   │   │   ├── HostLive.jsx         # Live dashboard — bar chart + controls
│   │   │   ├── JoinPage.jsx         # Player room code entry
│   │   │   ├── PlayerLobby.jsx      # Waiting for host to start
│   │   │   ├── PlayerGame.jsx       # Question + answer buttons
│   │   │   └── ResultsPage.jsx      # Final leaderboard (host + player)
│   │   ├── components/
│   │   │   ├── LiveBarChart.jsx     # Recharts bar chart, updates via socket
│   │   │   ├── Leaderboard.jsx      # Ranked player list
│   │   │   ├── QRCodeDisplay.jsx    # qrcode.react wrapper
│   │   │   ├── QuestionCard.jsx     # Player answer UI
│   │   │   ├── CountdownTimer.jsx   # Synced countdown bar
│   │   │   └── ProtectedRoute.jsx   # Redirects to /auth if no JWT
│   │   ├── socket/
│   │   │   └── socket.js            # Socket.io singleton
│   │   ├── store/
│   │   │   └── useQuizStore.js      # Zustand global state
│   │   ├── hooks/
│   │   │   └── useAuth.js           # JWT read/write helpers
│   │   ├── api/
│   │   │   └── quizApi.js           # Axios calls for CRUD + export
│   │   └── App.jsx
│   └── package.json
│
├── server/                          # Express backend (deploy to Render)
│   ├── index.js                     # App entry — Express + Socket.io init
│   ├── socket/
│   │   └── quizSocket.js            # All socket event handlers
│   ├── routes/
│   │   ├── auth.js                  # POST /register, POST /login
│   │   ├── quiz.js                  # CRUD for quizzes (protected)
│   │   ├── session.js               # Session history reads
│   │   └── export.js                # PDF export endpoint
│   ├── models/
│   │   ├── User.js
│   │   ├── Quiz.js
│   │   └── Session.js
│   ├── middleware/
│   │   └── authMiddleware.js
│   ├── services/
│   │   ├── quizService.js           # Scoring, leaderboard calculation
│   │   └── pdfService.js            # Puppeteer PDF generation
│   ├── utils/
│   │   └── roomCode.js              # nanoid 6-char generator
│   └── package.json
```

---

## 7. Database Schema

### User

```js
// models/User.js
const UserSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  email:     { type: String, required: true, unique: true },
  password:  { type: String, required: true },  // bcrypt hash
  createdAt: { type: Date, default: Date.now }
})
```

### Quiz

```js
// models/Quiz.js
const QuestionSchema = new mongoose.Schema({
  text:         { type: String, required: true },
  options:      [{ type: String }],          // max 4 options
  correctIndex: { type: Number, required: true },
  timeLimit:    { type: Number, default: 30 } // seconds
})

const QuizSchema = new mongoose.Schema({
  hostId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title:     { type: String, required: true },
  questions: [QuestionSchema],
  createdAt: { type: Date, default: Date.now }
})
```

### Session

```js
// models/Session.js
const PlayerSchema = new mongoose.Schema({
  playerId: String,      // crypto.randomUUID() from client
  name:     String,
  score:    { type: Number, default: 0 }
})

const ResponseSchema = new mongoose.Schema({
  playerId:      String,
  questionIndex: Number,
  optionIndex:   Number,
  isCorrect:     Boolean,
  pointsAwarded: Number,
  answeredAt:    Date    // used for speed bonus calculation
})

const SessionSchema = new mongoose.Schema({
  quizId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz' },
  roomCode:    { type: String, unique: true, index: true },
  status:      { type: String, enum: ['waiting', 'live', 'ended'], default: 'waiting' },
  currentIndex:{ type: Number, default: 0 },
  players:     [PlayerSchema],
  responses:   [ResponseSchema],
  votes:       { type: Map, of: [Number] }, // questionIndex → [count per option]
  startedAt:   Date,
  endedAt:     Date
})
```

---

## 8. REST API Endpoints

### Auth routes — `/api/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | None | Create host account |
| POST | `/api/auth/login` | None | Returns JWT |
| GET | `/api/auth/me` | JWT | Get current host profile |

### Quiz routes — `/api/quiz`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/quiz` | JWT | All quizzes for logged-in host |
| POST | `/api/quiz` | JWT | Create new quiz |
| GET | `/api/quiz/:id` | JWT | Single quiz detail |
| PUT | `/api/quiz/:id` | JWT | Update quiz |
| DELETE | `/api/quiz/:id` | JWT | Delete quiz |
| POST | `/api/quiz/:id/session` | JWT | Create a new live session (returns roomCode) |

### Session routes — `/api/session`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/session/:roomCode` | None | Validate room code exists (player join check) |
| GET | `/api/session/history` | JWT | All past sessions for this host |

### Export route — `/api/export`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/export/:sessionId` | JWT | Generate and return PDF of session results |

---

## 9. Socket.io Event Reference

### Host emits → Server handles

```
quiz:start        { roomCode }
                  → broadcasts quiz:question to all players in room
                  → starts server-side timer

quiz:next         { roomCode }
                  → increments currentIndex in session
                  → broadcasts next quiz:question to all players

quiz:reveal       { roomCode }
                  → calculates scores for current question
                  → broadcasts quiz:result to all (includes correctIndex)
                  → broadcasts leaderboard:update to all

quiz:end          { roomCode }
                  → sets session status to 'ended'
                  → broadcasts quiz:ended to all
                  → saves final state to MongoDB
```

### Player emits → Server handles

```
player:join       { roomCode, playerName, playerId }
                  → validates roomCode exists and status is 'waiting'
                  → adds player to session.players
                  → emits room:players to host with updated list

player:answer     { roomCode, questionIndex, optionIndex, playerId }
                  → validates: session is 'live', correct questionIndex,
                    player hasn't already answered this question
                  → increments in-memory vote counter
                  → saves response to session.responses
                  → emits quiz:stats to host socket only
```

### Server broadcasts

```
quiz:question     → all players in room
                  { text, options, timeLimit, index, totalQuestions }
                  NOTE: never includes correctIndex

quiz:stats        → host socket only (on every player:answer)
                  { votes: [12, 5, 8, 3], totalAnswered: 28, totalPlayers: 31 }

quiz:result       → everyone in room (on quiz:reveal)
                  { correctIndex, explanation?, leaderboard: [{name, score, rank}] }

leaderboard:update→ everyone in room
                  { leaderboard: [{name, score, rank, change}] }

room:players      → host socket only (on player:join / player:leave)
                  { count: 14, players: [{name, id}] }

quiz:ended        → everyone in room
                  { finalLeaderboard: [...], sessionId }

timer:tick        → everyone in room (every second)
                  { remaining: 24 }
```

---

## 10. Quiz State Machine

The server enforces valid state transitions. Clients cannot trigger events out of order.

```
         POST /api/quiz/:id/session
                    │
                    ▼
              ┌──────────┐
              │ WAITING  │  ← players join here
              └────┬─────┘
                   │ quiz:start (host)
                   ▼
           ┌───────────────┐
           │ QUESTION_OPEN │  ← players can answer
           └───────┬───────┘
                   │ quiz:reveal (host) OR timer expires
                   ▼
           ┌───────────────┐
           │   REVEALING   │  ← correct answer shown, scores calculated
           └───────┬───────┘
                   │ quiz:next (host)
                   ▼
           ┌───────────────┐
     ┌────▶│ QUESTION_OPEN │  ← next question
     │     └───────┬───────┘
     │             │ (last question revealed)
     │             ▼
     │     ┌───────────────┐
     └─────│   REVEALING   │
           └───────┬───────┘
                   │ quiz:end (host)
                   ▼
              ┌──────────┐
              │  ENDED   │  ← PDF export available
              └──────────┘
```

### Server-side enforcement in quizSocket.js

```js
socket.on('player:answer', async ({ roomCode, questionIndex, optionIndex, playerId }) => {
  const session = await Session.findOne({ roomCode })

  // State validation — reject if not in correct state
  if (!session) return
  if (session.status !== 'live') return
  if (session.currentIndex !== questionIndex) return

  // Prevent double answers
  const alreadyAnswered = session.responses.some(
    r => r.playerId === playerId && r.questionIndex === questionIndex
  )
  if (alreadyAnswered) return

  // Valid — process answer
  // ...
})
```

---

## 11. Real-Time Dashboard

### How the live bar chart works

Vote counts are stored in an **in-memory object on the server** (not in MongoDB) during an active question. This makes updates near-instant. On `quiz:reveal`, the final counts are persisted.

```js
// server/socket/quizSocket.js
const liveVotes = {}  // { "roomCode:questionIndex": [0, 0, 0, 0] }

socket.on('player:answer', ({ roomCode, questionIndex, optionIndex, playerId }) => {
  const key = `${roomCode}:${questionIndex}`
  if (!liveVotes[key]) liveVotes[key] = [0, 0, 0, 0]
  liveVotes[key][optionIndex]++

  // Emit stats only to the host — not all players
  const hostSocketId = roomHosts[roomCode]
  io.to(hostSocketId).emit('quiz:stats', {
    votes: liveVotes[key],
    totalAnswered: liveVotes[key].reduce((a, b) => a + b, 0)
  })
})
```

### Scoring algorithm

```js
// services/quizService.js
const BASE_POINTS = 1000
const MAX_SPEED_BONUS = 500

function calculatePoints(isCorrect, answeredAt, questionOpenedAt, timeLimit) {
  if (!isCorrect) return 0

  const elapsed = (answeredAt - questionOpenedAt) / 1000  // seconds
  const speedRatio = Math.max(0, 1 - elapsed / timeLimit)
  const speedBonus = Math.floor(speedRatio * MAX_SPEED_BONUS)

  return BASE_POINTS + speedBonus
}
```

---

## 12. QR Code Join Flow

No backend work needed. The QR code is generated entirely on the frontend.

```jsx
// components/QRCodeDisplay.jsx
import { QRCodeSVG } from 'qrcode.react'

export default function QRCodeDisplay({ roomCode }) {
  const joinUrl = `${window.location.origin}/join/${roomCode}`

  return (
    <div>
      <QRCodeSVG value={joinUrl} size={200} />
      <p>Or enter code: <strong>{roomCode}</strong></p>
    </div>
  )
}
```

Player scans QR → lands on `/join/ROOMCODE` → `roomCode` is pre-filled from URL params → player just enters their name and hits Join.

```jsx
// pages/JoinPage.jsx — read code from URL
import { useParams } from 'react-router-dom'

const { code } = useParams()  // /join/:code
const [roomCode, setRoomCode] = useState(code || '')
```

---

## 13. PDF Export

The PDF mirrors Mentimeter's results report: cover page with quiz title and date, one page per question showing the bar chart and correct answer, and a final leaderboard page.

### How it works

The host clicks "Export PDF" on the results page. This hits `GET /api/export/:sessionId` with their JWT. The server uses **Puppeteer** to render an HTML template with the session data, then returns it as a binary PDF download.

```js
// services/pdfService.js
const puppeteer = require('puppeteer')

async function generateSessionPDF(session, quiz) {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] })
  const page = await browser.newPage()

  const html = buildReportHTML(session, quiz)  // build HTML string
  await page.setContent(html, { waitUntil: 'networkidle0' })

  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '40px', bottom: '40px', left: '40px', right: '40px' }
  })

  await browser.close()
  return pdf
}
```

```js
// routes/export.js
router.get('/:sessionId', authMiddleware, async (req, res) => {
  const session = await Session.findById(req.params.sessionId)
  const quiz = await Quiz.findById(session.quizId)

  // Verify the requesting host owns this quiz
  if (quiz.hostId.toString() !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const pdf = await generateSessionPDF(session, quiz)

  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="quiz-results-${session.roomCode}.pdf"`
  })
  res.send(pdf)
})
```

### PDF report structure

```
Page 1 — Cover
  - Quiz title
  - Date and time of session
  - Total participants
  - Average score

Page 2..N — One page per question
  - Question text
  - Bar chart (option labels + vote counts + percentages)
  - Correct answer highlighted in green
  - % of players who got it right

Last page — Final Leaderboard
  - Top 10 players with scores
  - Rank, name, score columns
```

---

## 14. Frontend Pages & Components

### Page routing

```jsx
// App.jsx
<Routes>
  <Route path="/"               element={<LandingPage />} />
  <Route path="/auth"           element={<AuthPage />} />
  <Route path="/dashboard"      element={<ProtectedRoute><HostDashboard /></ProtectedRoute>} />
  <Route path="/quiz/new"       element={<ProtectedRoute><QuizBuilder /></ProtectedRoute>} />
  <Route path="/quiz/:id/edit"  element={<ProtectedRoute><QuizBuilder /></ProtectedRoute>} />
  <Route path="/host/:roomCode" element={<ProtectedRoute><HostLive /></ProtectedRoute>} />
  <Route path="/join"           element={<JoinPage />} />
  <Route path="/join/:code"     element={<JoinPage />} />
  <Route path="/play/:roomCode" element={<PlayerGame />} />
  <Route path="/results/:sessionId" element={<ResultsPage />} />
</Routes>
```

### Zustand store shape

```js
// store/useQuizStore.js
const useQuizStore = create((set) => ({
  // Session state
  roomCode: null,
  sessionId: null,
  status: 'idle',           // idle | waiting | live | revealing | ended

  // Quiz content
  questions: [],
  currentIndex: 0,
  currentQuestion: null,

  // Live data
  players: [],
  votes: [],
  leaderboard: [],

  // Player state
  playerId: null,
  playerName: null,
  myAnswer: null,
  myScore: 0,

  // Actions
  setRoom: (roomCode, sessionId) => set({ roomCode, sessionId }),
  setQuestion: (q, index) => set({ currentQuestion: q, currentIndex: index, myAnswer: null }),
  setVotes: (votes) => set({ votes }),
  setLeaderboard: (leaderboard) => set({ leaderboard }),
  setStatus: (status) => set({ status }),
}))
```

### Socket singleton

```js
// socket/socket.js
import { io } from 'socket.io-client'

const socket = io(import.meta.env.VITE_SERVER_URL, {
  autoConnect: false
})

export default socket
```

Call `socket.connect()` when entering a live session, `socket.disconnect()` on unmount.

---

## 15. Build Order

Build in this sequence to avoid rewrites. Each step produces something testable.

```
Step 1 — Backend foundation
  mongoose connection + User model
  POST /api/auth/register and /login with JWT
  Test with Postman

Step 2 — Quiz CRUD
  Quiz model + routes (protected)
  GET/POST/PUT/DELETE /api/quiz
  Test: create a quiz, retrieve it

Step 3 — Session creation
  Session model
  POST /api/quiz/:id/session → returns roomCode
  GET /api/session/:roomCode → validates for player join

Step 4 — Socket foundation
  quizSocket.js skeleton
  player:join → adds to session, host sees player count live
  Test: two browser tabs, one as host, one as player

Step 5 — Core quiz loop
  quiz:start → quiz:question broadcast
  player:answer → quiz:stats to host
  quiz:reveal → scores → leaderboard:update
  Test: full round with 2 tabs

Step 6 — Frontend auth
  AuthPage (login/register)
  ProtectedRoute, JWT in localStorage
  HostDashboard showing quiz list

Step 7 — Quiz builder UI
  QuizBuilder form (title + questions + options + correct answer)
  Calls POST /api/quiz

Step 8 — Host live view
  HostLobby with QR code + player list
  HostLive with LiveBarChart (recharts) + advance/reveal controls

Step 9 — Player views
  JoinPage (room code or URL param)
  PlayerGame (question card + answer buttons)
  Correct/wrong feedback after reveal

Step 10 — PDF export
  pdfService.js with Puppeteer
  GET /api/export/:sessionId
  "Export PDF" button on ResultsPage
```

---

## 16. Environment Variables

### Server `.env`

```
PORT=5000
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/quizlive
JWT_SECRET=your_super_secret_key_here
CLIENT_URL=https://quizlive.vercel.app
```

### Client `.env`

```
VITE_SERVER_URL=https://quizlive-api.onrender.com
```

---

## 17. Deployment

### Frontend → Vercel

```bash
cd client
npm run build
# Push to GitHub, connect repo to Vercel
# Set VITE_SERVER_URL in Vercel environment variables
```

### Backend → Render

```
New Web Service → connect GitHub repo
Root directory: server
Build command: npm install
Start command: node index.js
Environment variables: add all from .env
```

### Keep Render alive (free tier)

Use [cron-job.org](https://cron-job.org) to ping your Render URL every 10 minutes so the server doesn't spin down.

```
URL: https://quizlive-api.onrender.com/health
Interval: every 10 minutes
```

Add a health endpoint:

```js
app.get('/health', (req, res) => res.json({ status: 'ok' }))
```

### MongoDB Atlas

Create a free M0 cluster. Whitelist `0.0.0.0/0` for Render's dynamic IPs. Use the connection string in `MONGODB_URI`.

---

## Summary

| Layer | Technology | Hosting |
|---|---|---|
| Frontend | React + Zustand + Recharts | Vercel |
| Backend | Express + Socket.io | Render |
| Database | MongoDB | Atlas (free tier) |
| Auth | JWT + bcrypt | — |
| Real-time | Socket.io rooms | — |
| QR code | qrcode.react (frontend only) | — |
| PDF export | Puppeteer (server-side) | — |

The only part that's genuinely tricky is the quiz state machine — enforce it server-side from day 1 and the rest of the app flows naturally from it.
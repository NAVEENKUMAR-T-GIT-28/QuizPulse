# ⚡ QuizPulse — Frontend Documentation

> Complete technical reference for the React 19 client application.
>
> 🐳 **Docker Documentation**: For container-specific setup and architecture, see [README.Docker.md](./README.Docker.md).

---

## Table of Contents

- [Project Overview](#project-overview)
- [Tech Stack & Dependencies](#tech-stack--dependencies)
- [Project Structure](#project-structure)
- [Entry Points](#entry-points)
- [Routing Architecture](#routing-architecture)
- [State Management — Zustand Store](#state-management--zustand-store)
- [HTTP API Layer](#http-api-layer)
- [WebSocket Layer](#websocket-layer)
- [Authentication System](#authentication-system)
- [Session Recovery System](#session-recovery-system)
- [Context Providers](#context-providers)
- [Pages — Detailed Breakdown](#pages--detailed-breakdown)
  - [LandingPage](#landingpage)
  - [AuthPage](#authpage)
  - [HostDashboard](#hostdashboard)
  - [QuizBuilder](#quizbuilder)
  - [HostLobby](#hostlobby)
  - [HostLive](#hostlive)
  - [JoinPage](#joinpage)
  - [PlayerLobby](#playerlobby)
  - [PlayerGame](#playergame)
  - [ResultsPage](#resultspage)
  - [HistoryPage](#historypage)
  - [ProfilePage](#profilepage)
- [Components — Detailed Breakdown](#components--detailed-breakdown)
  - [ProtectedRoute](#protectedroute)
  - [CountdownTimer](#countdowntimer)
  - [LiveBarChart](#livebarchart)
  - [Leaderboard](#leaderboard)
  - [QRCodeDisplay](#qrcodedisplay)
  - [QuestionCard](#questioncard)
  - [Topbar](#topbar)
  - [Sidebar](#sidebar)
  - [ThemeToggle](#themetoggle)
  - [LiquidEther (Background)](#liquidether-background)
- [Hooks](#hooks)
  - [useAuth](#useauth)
  - [useSessionGuard](#usesessionguard)
- [Theme System](#theme-system)
- [Vite Configuration & Proxy](#vite-configuration--proxy)
- [Socket Event Reference](#socket-event-reference)
- [Data Flow Diagrams](#data-flow-diagrams)
- [LocalStorage Keys](#localstorage-keys)
- [Environment Variables](#environment-variables)
- [Development Setup](#development-setup)

---

## Project Overview

The QuizPulse client is a single-page React application that serves two distinct user types from the same codebase:

- **Hosts** — authenticated users who create quizzes, launch live sessions, and control the game flow via WebSocket events.
- **Players** — unauthenticated users who join sessions with a 6-character room code, answer questions in real time, and see their results.

The app is built with React 19, uses Zustand for global real-time state, and communicates with the backend via both REST (Axios) and WebSocket (Socket.io). All authentication is handled through `httpOnly` JWT cookies — there is no token in `localStorage`.

---

## Tech Stack & Dependencies

| Package | Version | Role |
|---------|---------|------|
| `react` | 19.2.5 | UI framework |
| `react-dom` | 19.2.5 | DOM renderer |
| `react-router-dom` | 7.14.2 | Client-side routing |
| `zustand` | 5.0.12 | Global state management |
| `axios` | 1.15.2 | HTTP requests to REST API |
| `socket.io-client` | 4.8.3 | WebSocket real-time communication |
| `recharts` | 3.8.1 | Live vote bar charts on host screen |
| `qrcode.react` | 4.2.0 | QR code generation in lobby |
| `three` | 0.184.0 | WebGL animated background (LiquidEther) |
| `vite` | 8.0.10 | Build tool and dev server |
| `@vitejs/plugin-react` | 6.0.1 | React Fast Refresh |

---

## Project Structure

```
client/
├── public/
│   ├── favicon.svg
│   └── icons.svg
├── src/
│   ├── api/
│   │   └── quizApi.js            # All Axios HTTP calls
│   ├── assets/
│   │   └── hero.png
│   ├── components/
│   │   ├── backgroud/
│   │   │   ├── LiquidEther.jsx   # Three.js WebGL fluid simulation
│   │   │   ├── LiquidEther.css
│   │   │   └── backgroud.jsx     # Wrapper — renders LiquidEther behind everything
│   │   ├── CountdownTimer.jsx    # Animated progress bar with colour shift
│   │   ├── Leaderboard.jsx       # Ranked player list with avatar initials
│   │   ├── LiveBarChart.jsx      # Recharts bar chart for live votes
│   │   ├── ProtectedRoute.jsx    # Auth guard for host routes
│   │   ├── QRCodeDisplay.jsx     # QR code pointing to join URL
│   │   ├── QuestionCard.jsx      # Player answer card (A/B/C/D options)
│   │   ├── Sidebar.jsx           # Host navigation sidebar
│   │   ├── ThemeToggle.jsx       # Dark/light toggle button
│   │   └── Topbar.jsx            # Top navigation bar
│   ├── context/
│   │   ├── ActiveSessionContext.jsx  # localStorage session persistence
│   │   └── ThemeContext.jsx          # Dark/light theme provider
│   ├── hooks/
│   │   ├── useAuth.js            # localStorage user helpers (no token)
│   │   └── useSessionGuard.js    # Session recovery on app load
│   ├── pages/
│   │   ├── AuthPage.jsx          # Login + register (with OTP flow)
│   │   ├── HistoryPage.jsx       # Host's past session list
│   │   ├── HostDashboard.jsx     # Quiz list + launch session
│   │   ├── HostLive.jsx          # Host game controller screen
│   │   ├── HostLobby.jsx         # Waiting room (host view)
│   │   ├── JoinPage.jsx          # Player enters room code + name
│   │   ├── LandingPage.jsx       # Public marketing landing
│   │   ├── PlayerGame.jsx        # Player game screen
│   │   ├── PlayerLobby.jsx       # Player waiting room
│   │   ├── ProfilePage.jsx       # Profile + password + delete account
│   │   ├── QuizBuilder.jsx       # Create / edit quiz
│   │   └── ResultsPage.jsx       # Post-session results + PDF export
│   ├── socket/
│   │   └── socket.js             # Socket.io singleton (autoConnect: false)
│   ├── store/
│   │   └── useQuizStore.js       # Zustand global store
│   ├── App.css                   # Global utility classes
│   ├── App.jsx                   # Router, ErrorBoundary, AppRoutes
│   ├── index.css                 # CSS variables, base styles
│   └── main.jsx                  # React entry point
├── index.html
├── vite.config.js
└── package.json
```

---

## Entry Points

### `main.jsx`

The React entry point. Renders `<App />` inside `React.StrictMode`. Wraps the application with `ThemeProvider` so every component can access dark/light theme.

### `App.jsx`

Contains three logical layers:

**`ErrorBoundary` (class component)**
Catches render errors thrown anywhere in the component tree. On error, shows a recovery screen with a "Go to home screen" button that resets state and navigates to `/`. Must be a class component — React has no hook equivalent for `getDerivedStateFromError`.

**`AppRoutes` (function component)**
Runs `useSessionGuard()` before rendering any route. While the guard is checking active sessions, a spinner is shown. Once the guard resolves (`ready === true`), the route tree renders normally.

**Route declarations**
All routes are declared inside `AppRoutes`. Host routes are wrapped with `<ProtectedRoute>`. Player routes have no auth wrapper.

---

## Routing Architecture

| Path | Component | Auth | Role |
|------|-----------|------|------|
| `/` | `LandingPage` | None | Public landing |
| `/auth` | `AuthPage` | None | Login / Register |
| `/dashboard` | `HostDashboard` | ✅ JWT | Host quiz list |
| `/quiz/new` | `QuizBuilder` | ✅ JWT | Create new quiz |
| `/quiz/:id/edit` | `QuizBuilder` | ✅ JWT | Edit existing quiz |
| `/lobby/:roomCode` | `HostLobby` | ✅ JWT | Host waiting room |
| `/host/:roomCode` | `HostLive` | ✅ JWT | Host game controller |
| `/results/:sessionId` | `ResultsPage` | ✅ JWT | Post-session results |
| `/history` | `HistoryPage` | ✅ JWT | Session history list |
| `/profile` | `ProfilePage` | ✅ JWT | Account settings |
| `/join` | `JoinPage` | None | Player enters code |
| `/join/:code` | `JoinPage` | None | Player — code pre-filled |
| `/lobby/:roomCode/wait` | `PlayerLobby` | None | Player waiting room |
| `/play/:roomCode` | `PlayerGame` | None | Player game screen |
| `*` | Redirect → `/` | None | 404 fallback |

**`ProtectedRoute`** checks `isLoggedIn()` (reads `user` key from `localStorage`). If not logged in, redirects to `/auth`. This is a UI-layer guard only — the server enforces JWT verification on every protected API call independently.

---

## State Management — Zustand Store

**File:** `src/store/useQuizStore.js`

The store holds all real-time session state. It is a flat object — no slices, no nested reducers. State is updated synchronously by socket event handlers in page components.

### State Shape

```js
{
  // Session identifiers
  roomCode: null,           // '3X7KFB'
  sessionId: null,          // MongoDB ObjectId string

  // Lifecycle
  status: 'idle',           // 'idle' | 'waiting' | 'live' | 'revealing' | 'ended'

  // Quiz content
  questions: [],
  currentIndex: 0,
  currentQuestion: null,    // { text, options, timeLimit, index, totalQuestions }

  // Live data from socket
  players: [],              // [{ name, id, active }]
  votes: [],                // [12, 5, 8, 3] — count per option
  leaderboard: [],          // [{ rank, name, score, rankChange, playerId }]
  timer: null,              // seconds remaining (from timer:tick events)

  // Player-specific
  playerId: null,
  playerName: null,
  myAnswer: null,           // optionIndex or null
  myScore: 0,
  isCorrect: null,          // true | false | null
}
```

### Actions

| Action | Signature | Description |
|--------|-----------|-------------|
| `setRoom` | `(roomCode, sessionId)` | Sets room identifiers |
| `setStatus` | `(status)` | Updates lifecycle status |
| `setQuestion` | `(q)` | Sets current question; resets `myAnswer`, `isCorrect`, and `votes` to fresh empty array |
| `setVotes` | `(votes)` | Updates live vote counts |
| `setLeaderboard` | `(leaderboard)` | Updates leaderboard data |
| `setPlayers` | `(players)` | Updates player list in lobby |
| `setTimer` | `(timer)` | Updates countdown seconds |
| `setMyAnswer` | `(optionIndex)` | Records player's selected option |
| `setMyResult` | `(isCorrect, points)` | Sets correct/wrong flag; adds points to `myScore` |
| `setPlayerId` | `(id)` | Sets player's persistent ID |
| `setPlayerName` | `(name)` | Sets player's display name |
| `resetSession` | `()` | Clears all session state and removes `qp_session_ended` from localStorage |

**Note on `setQuestion`:** When a new question arrives, `votes` is reset to `new Array(q.options.length).fill(0)` so the bar chart starts at zero for each question.

**Note on `setMyResult`:** Uses a functional updater to safely accumulate `myScore += pointsThisRound`.

---

## HTTP API Layer

**File:** `src/api/quizApi.js`

All REST calls are made through a single Axios instance configured with `withCredentials: true`. This ensures the `httpOnly` JWT cookie is included automatically on every request. There is no Authorization header.

```js
const api = axios.create({
  baseURL: import.meta.env.VITE_SERVER_URL || '',
  withCredentials: true,
})
```

### Auth Endpoints

| Function | Method | Endpoint | Body | Returns |
|----------|--------|----------|------|---------|
| `registerInitiate` | POST | `/api/auth/register/initiate` | `{ name, email, password }` | `{ message }` |
| `registerVerify` | POST | `/api/auth/register/verify` | `{ email, otp }` | `{ user }` + sets cookie |
| `registerResend` | POST | `/api/auth/register/resend` | `{ email }` | `{ message }` |
| `login` | POST | `/api/auth/login` | `{ email, password }` | `{ user }` + sets cookie |
| `logout` | POST | `/api/auth/logout` | — | Clears cookie |
| `getMe` | GET | `/api/auth/me` | — | `{ user }` |
| `updateProfile` | PATCH | `/api/auth/profile` | `{ name?, email? }` | `{ user }` |
| `changePassword` | POST | `/api/auth/profile/change-password` | `{ currentPassword, newPassword }` | `{ message }` |
| `deleteAccount` | DELETE | `/api/auth/account` | `{ password }` | `{ message }` |

### Quiz Endpoints

| Function | Method | Endpoint | Returns |
|----------|--------|----------|---------|
| `getQuizzes` | GET | `/api/quiz` | `{ quizzes }` |
| `getQuiz(id)` | GET | `/api/quiz/:id` | `{ quiz }` |
| `createQuiz(payload)` | POST | `/api/quiz` | `{ quiz }` |
| `updateQuiz(id, payload)` | PUT | `/api/quiz/:id` | `{ quiz }` |
| `deleteQuiz(id)` | DELETE | `/api/quiz/:id` | `{ message }` |

### Session Endpoints

| Function | Method | Endpoint | Returns |
|----------|--------|----------|---------|
| `createSession(quizId)` | POST | `/api/quiz/:quizId/session` | `{ sessionId, roomCode }` |
| `validateRoom(roomCode)` | GET | `/api/session/:roomCode` | `{ sessionId, status, ... }` |
| `verifyHostSession(roomCode)` | GET | `/api/session/:roomCode/verify-host` | `{ ok, status, sessionId }` |
| `getSessionHistory()` | GET | `/api/session/history` | `{ sessions }` |
| `deleteSession(sessionId)` | DELETE | `/api/session/:sessionId` | `{ message }` |
| `getSessionResults(sessionId)` | GET | `/api/session/:sessionId/results` | `{ session, leaderboard, questionStats }` |

### Export Endpoints

`exportSessionPdf(sessionId, filename)` — Uses native `fetch()` (not Axios) with `credentials: 'include'` because it needs to handle a binary `Blob` response. On success, triggers a browser file download via a programmatic anchor click. On `pdf_quality_failed` error with `fallbackAvailable: true`, prompts the user to confirm fallback to the PDFKit version. The `downloadBlob` helper creates an object URL, clicks a temporary `<a>` element, then immediately revokes the URL to avoid memory leaks.

---

## WebSocket Layer

**File:** `src/socket/socket.js`

A single Socket.io client singleton is created once and exported. It is configured with `autoConnect: false` so it only connects when a page explicitly calls `socket.connect()`. The `withCredentials: true` flag sends the `httpOnly` JWT cookie with the WebSocket handshake — the server reads it to authenticate host sockets.

```js
const socket = io(import.meta.env.VITE_SERVER_URL || '', {
  autoConnect: false,
  withCredentials: true,
})
export default socket
```

The same instance is shared across `HostLobby`, `HostLive`, `PlayerLobby`, and `PlayerGame`. This is critical: the socket must **not** be disconnected when navigating from `HostLobby` → `HostLive`, because the session is still active on the server.

Pages register event listeners in `useEffect` and clean them up in the return function using `socket.off(event, handler)`. Always passing the **named handler reference** to `off()` (never `socket.off(event)`) prevents accidentally removing listeners registered by other components.

---

## Authentication System

**File:** `src/hooks/useAuth.js`

Authentication state is stored as a JSON user object in `localStorage` under the key `user`. **No JWT token is stored in JavaScript-land.** The actual JWT lives exclusively in an `httpOnly` cookie managed by the browser and the server.

### Functions

| Function | Description |
|----------|-------------|
| `getUser()` | Reads and parses the `user` key from localStorage. Returns `null` on missing or malformed data. |
| `saveAuth(user)` | Writes the user object to localStorage after successful login or register. Called `setUser` as an alias for profile update. |
| `clearAuth()` | Removes the `user` key from localStorage. The actual cookie is cleared by calling `POST /api/auth/logout`. |
| `isLoggedIn()` | Returns `!!getUser()`. Used by `ProtectedRoute` for route guarding. |

### Registration Flow (OTP)

1. User fills in name, email, password on `AuthPage` → calls `registerInitiate()`.
2. Server sends a 6-digit OTP to the email. The UI transitions to an OTP input screen.
3. User submits the 6-digit code → calls `registerVerify()`.
4. On success, the server sets the `httpOnly` JWT cookie and returns `{ user }`. The client calls `saveAuth(user)` and navigates to `/dashboard`.
5. If the OTP is wrong, the server returns remaining attempts. At 0 attempts, the user must restart registration.
6. A "Resend code" button calls `registerResend()` to generate a new OTP.

### Login Flow

1. User submits email + password → calls `login()`.
2. Server validates credentials and sets the `httpOnly` JWT cookie. Returns `{ user }`.
3. Client calls `saveAuth(user)` and navigates to `/dashboard`.

---

## Session Recovery System

**File:** `src/hooks/useSessionGuard.js`

Runs once on app startup inside `AppRoutes`, before any route renders. Checks whether the user was mid-session when they closed their tab, and redirects them back automatically.

### Two-Path Recovery

**Path A — localStorage has `qp_active_session`:**

This key is set by any page that starts or joins a live session. The guard reads the stored `{ role, roomCode, sessionId, playerId?, playerName? }` object and validates it against the server:

- GET `/api/session/:roomCode` → If the session is still active, the guard redirects to the correct live page (host: `/host/:roomCode` or `/lobby/:roomCode`; player: `/play/:roomCode` or `/lobby/:roomCode/wait`). For players, it also restores `qp_playerId` and `qp_playerName` to localStorage so the game page can reconnect.
- If the server returns 404 or the session is `ended`, the stale entry is cleared and routing proceeds normally.

**Path B — No local session, user is a logged-in host:**

If Path A has no data, the guard silently calls GET `/api/session/mine`. If the server finds a non-ended session owned by the current user, the guard writes it to `qp_active_session` and redirects to the appropriate page. A 401 response (not logged in) is silently swallowed — routing proceeds normally.

### Why This Matters

Without this guard, a host who closes a tab mid-quiz would land on the dashboard on their next visit with no way to re-join the live session. The guard makes re-joining automatic and transparent.

---

## Context Providers

### `ThemeContext.jsx`

Provides `{ theme, toggle }` to the entire component tree. The current theme (`'dark'` | `'light'`) is persisted to `localStorage` under `qp-theme`. On mount, the theme is read from localStorage (defaulting to `'dark'`). On change, `document.documentElement.setAttribute('data-theme', theme)` applies the CSS variable set for the selected theme.

All styling uses CSS custom properties (e.g. `var(--bg)`, `var(--text)`, `var(--indigo-l)`) that switch values when `data-theme` changes.

### `ActiveSessionContext.jsx`

Not a React context in the traditional sense — it exports three pure functions that read/write a single `localStorage` key `qp_active_session`:

| Function | Description |
|----------|-------------|
| `setActiveSession(data)` | Stores session data as JSON. Shape: `{ role, roomCode, sessionId?, playerId?, playerName? }` |
| `getActiveSession()` | Reads and parses the stored data. Returns `null` on missing or invalid JSON. |
| `clearActiveSession()` | Removes the key from localStorage. Called on session end, cancel, or logout. |

This is used by `useSessionGuard` to perform session recovery, and by page components to mark their session as active.

---

## Pages — Detailed Breakdown

### LandingPage

Public marketing page. Shows the QuizPulse hero section with feature highlights and a call-to-action to sign up or join a quiz. No logic — purely presentational.

---

### AuthPage

Handles both login and registration from a single page, toggled by local `mode` state (`'login'` | `'register'` | `'otp'`).

**Registration flow UI states:**
- `'register'` → Form with name, email, password fields → on submit calls `registerInitiate()`.
- `'otp'` → 6-input OTP grid. Each digit input auto-focuses the next. Paste handling splits and distributes across inputs. "Resend code" button with a 60-second cooldown (local `resendTimer` state). On submit calls `registerVerify()`.

**Login state:**
- Email + password form. On success: `saveAuth(user)` → navigate to `/dashboard`.

**Error handling:**
- All API errors display the server's `error` message inline below the form.
- On `registerVerify`, the remaining attempt count from the server is shown (e.g. "2 attempts remaining").

---

### HostDashboard

The main host home screen after login. Lists all quizzes owned by the host, fetched from GET `/api/quiz` on mount.

**Actions:**
- "New Quiz" button → navigate to `/quiz/new`.
- Edit button on a quiz card → navigate to `/quiz/:id/edit`.
- Delete button → confirmation modal → `deleteQuiz(id)` → refetch list.
- "Start" button → `createSession(quizId)` → on success, navigate to `/lobby/:roomCode`.
- Logout button → `logout()` → `clearAuth()` → navigate to `/`.

Displays the host's name from `getUser()`. No socket connection on this page.

---

### QuizBuilder

Used for both creating (`/quiz/new`) and editing (`/quiz/:id/edit`) quizzes. Detects the mode from the presence of `:id` in the URL params.

**On edit:** Fetches quiz data with `getQuiz(id)` and populates the form.

**Form fields:**
- Quiz title (required, max 120 chars).
- Description (optional, max 300 chars).
- Timer mode: `'per-question'` (each question has its own timer) or `'quiz'` (one shared timer for all questions).
- If `timerMode === 'quiz'`: a single `quizTimeLimit` input (5–300 seconds).
- Questions array: each question has text (max 500 chars), 2–4 options (each max 200 chars), a `correctIndex` selector, and (if `timerMode === 'per-question'`) a per-question `timeLimit` (5–120 seconds, default 10).

**Validation:** Inline error messages per field. Mirrors the server-side validation rules exactly so errors are surfaced before the API call.

**Save:** Calls `createQuiz()` or `updateQuiz()` as appropriate. On success, navigates to `/dashboard`.

**Add/remove questions:** Local state manages the questions array. Questions can be reordered (up/down buttons) and removed (min 1, max 25).

---

### HostLobby

The waiting room the host sees after launching a session.

**Initialization (two-step):**
1. `verifyHostSession(roomCode)` — confirms the authenticated user owns this session. On 403, redirects to `/dashboard` with an error state. Also retrieves `sessionId` for the cancel flow. On success, calls `setActiveSession({ role: 'host', roomCode, sessionId })`.
2. After auth check passes: connects the socket (if not already connected), registers listeners, and emits `host:join` to enter the server-side room.

**Socket listeners registered here:**
- `host:joined` → `setPlayers(players)` — syncs the current player list on join.
- `room:players` → `setPlayers(players)` — live updates as players join/leave.
- `quiz:question` → stores question in Zustand, sets status to `'live'`, navigates to `/host/:roomCode`. This is how the lobby page knows the quiz started.
- `connect` → re-emits `host:join` on reconnection.

**Note:** The socket is NOT disconnected in the cleanup function. It must remain connected for `HostLive` to receive events.

**Player display:** Shows a grid of avatar cards with color-coded initials. Each avatar has a green "online" dot. Only `active !== false` players are shown and counted.

**QR code:** A `QRCodeDisplay` component renders a QR code pointing to `${window.location.origin}/join/${roomCode}`.

**Start button:** Disabled until at least one active player is in the room. On click, emits `quiz:start`. Navigation happens automatically when `quiz:question` is received (not on button click).

**Cancel flow:** Confirmation modal → `socket.emit('host:cancel', { roomCode })` → `clearActiveSession()` → `socket.disconnect()` → navigate to `/dashboard`. The server deletes the session and notifies all players.

---

### HostLive

The host's game controller screen during a live session.

**Initialization (two-step):**
1. `verifyHostSession(roomCode)` — same ownership check as HostLobby. Sets `authChecked` to `true`.
2. After auth check: registers socket listeners, connects if needed, emits `host:join`.

**On `host:joined`:** If the session is already `live` or `revealing` (reconnect case), restores the current question from the payload.

**Socket listeners:**
- `quiz:question` → `setQuestion(payload)`, `setStatus('live')`, resets `correctIndex` and `totalAnswered`.
- `quiz:stats` → `setVotes(votes)`, `setTotalAnswered`, `setTotalPlayers`. Updated every time a player answers.
- `quiz:result` → `setStatus('revealing')`, `setVotes(votes)`, `setLeaderboard(leaderboard)`, `setCorrectIndex(ci)`.
- `timer:tick` → `setTimer(remaining)`.
- `quiz:ended` → `clearActiveSession()`, navigate to `/results/:sessionId`.
- `connect` → re-emits `host:join`.
- `disconnect` → shows reconnecting overlay.

**Reconnecting overlay:** When `reconnecting === true`, the main content is replaced with a spinner overlay. On socket reconnect (`connect` event), `host:join` is re-emitted and `setReconnecting(false)` hides the overlay.

**Live statistics panel (while `status === 'live'`):**
- Response rate percentage: `(totalAnswered / totalPlayers) * 100`.
- 4 stat cards: Answered, Waiting, Correct, Accuracy.
- `LiveBarChart` — vote bars, all indigo while live; green/red after reveal.
- `CountdownTimer` — progress bar showing time remaining.

**Actions:**
- "Reveal Answer" button (visible while `status === 'live'`) → `socket.emit('quiz:reveal', { roomCode })`.
- "Next Question" button (visible while `status === 'revealing'` and not on last question) → `socket.emit('quiz:next', { roomCode })`.
- "End Quiz" button → `clearActiveSession()` + `socket.emit('quiz:end', { roomCode })`.

**Leaderboard sidebar:** Shows top 5 players with rank, name, and score. Active players have a green dot.

---

### JoinPage

Player entry point. Accepts a room code and a display name.

- If the URL is `/join/:code`, the `code` param pre-fills the room code field.
- On submit: calls `validateRoom(roomCode)` to confirm the room exists and is not ended. If valid: stores `playerId` (generated as `crypto.randomUUID()` on first visit, persisted in localStorage), `playerName`, and `roomCode` to localStorage, then navigates to `/lobby/:roomCode/wait`.
- Displays server validation errors inline (room not found, session already ended).

---

### PlayerLobby

The player's waiting room. Connects to the socket and emits `player:join` with their `playerId`, `playerName`, and `roomCode` from localStorage.

**Socket listeners:**
- `player:joined` → confirms join was accepted; reads `status` to check if the game already started (handles mid-game reconnect).
- `room:players` → updates the player count display.
- `quiz:question` → navigates to `/play/:roomCode` (game started).
- `session_canceled` → shows a "Session canceled" toast and redirects to `/join`.
- `connect` → re-emits `player:join` on reconnection.

---

### PlayerGame

The main player game screen. The most complex player-facing component.

**Initialization:**
1. Validates the room via REST (`GET /api/session/:roomCode`). Sets `roomStatus` to `'valid'`, `'invalid'`, or `'ended'`.
2. If `roomStatus === 'ended'`: checks localStorage for `qp_session_ended` (set by the `quiz:ended` socket event). If the cached entry matches the current roomCode, restores the final leaderboard and renders the "Quiz Over" screen. Otherwise, redirects to `/join`.
3. If `roomStatus === 'valid'`: connects the socket and registers listeners.

**Socket listeners:**
- `quiz:question` → `setQuestion(payload)`, `setStatus('live')`, resets `correctIndex`, `answerConfirmed`, `lastPointsEarned`.
- `quiz:result` → `setCorrectIndex(ci)`, `setLeaderboard(lb)`, `setStatus('revealing')`. Reads `pointsMap[playerId]` to determine `pointsEarned`. Computes `correct = myAnswer === ci`.
- `timer:tick` → `setTimer(remaining)`.
- `answer:received` → sets `answerConfirmed = true` (changes UI from "Submitting…" to "✓ Answer submitted!").
- `quiz:ended` → stores final leaderboard to `localStorage.qp_session_ended`, sets `status` to `'ended'`.
- `player:joined` → handles reconnect to a mid-game session.
- `connect` → re-emits `player:join` using stored identity from Zustand or localStorage.
- `error` → logs and redirects to `/join`.
- `session_canceled` → shows "Session Canceled" modal, clears state, disconnects socket.

**`handleAnswer(optionIndex)`:** Only fires if `myAnswer === null` AND `status === 'live'`. Calls `setMyAnswer(optionIndex)` immediately (optimistic UI) then emits `player:answer`. The server's `player:answer` handler deduplicates server-side, so double-taps are harmless.

**`handlePlayAgain`:** Resets all Zustand state, clears all player localStorage keys, disconnects socket, navigates to `/join`.

**Rendering states:**
- `'checking'` → spinner.
- `'invalid'` → "Room Not Found" error screen.
- `status === 'ended'` → final "Quiz Over!" screen with full leaderboard and "Play Again" button.
- Normal game view → question card + countdown timer + feedback panel on reveal.

**`QuestionCard`** receives the full question, the player's answer, the correct index (null until reveal), and an `onAnswer` callback. It renders four colored option buttons (A/B/C/D).

**Feedback panel (after reveal):** Shows a ✓ Correct / ✗ Wrong banner with the points earned, then a top-5 leaderboard snippet with the current player highlighted in their own row.

---

### ResultsPage

Post-session results page. Host-only, requires JWT.

Fetches session results via `getSessionResults(sessionId)` on mount.

**Displays:**
- Session metadata: quiz title, room code, player count, start/end time.
- Final leaderboard (full list, not just top 5).
- Per-question breakdown: question text, correct answer, per-option vote counts, accuracy percentage, a visual bar showing vote distribution.

**PDF export button:** Calls `exportSessionPdf(sessionId)`. The `quizApi.js` function handles both the Puppeteer high-quality and PDFKit fallback paths automatically.

---

### HistoryPage

Lists all sessions ever created by the host, fetched from `GET /api/session/history`. Each row shows quiz title, room code, player count, date, and status badge.

Clicking a completed session navigates to `/results/:sessionId`. Rows for active sessions (waiting/live) navigate to the appropriate live page. A delete button on each row calls `deleteSession(sessionId)` and removes the row from local state.

---

### ProfilePage

Account management page. Reads initial user data from `getUser()` (localStorage cache) and fetches fresh data from `GET /api/auth/me` on mount.

**Three sections:**
1. **Profile info** — name and email fields. On save: `updateProfile({ name, email })`. On success, refreshes the cookie (server re-issues it) and calls `setUser(updatedUser)` to update localStorage.
2. **Change password** — current password + new password (min 6 chars). On save: `changePassword(currentPassword, newPassword)`.
3. **Delete account** — requires password confirmation. On confirm: `deleteAccount(password)` → `clearAuth()` → navigate to `/`. The server cascades deletes all quizzes and sessions.

---

## Components — Detailed Breakdown

### ProtectedRoute

```jsx
if (!isLoggedIn()) return <Navigate to="/auth" replace />
return children
```

Wraps all host-only routes. Checks `isLoggedIn()` synchronously on every render. No server call — it just checks whether a user object exists in localStorage. The server independently validates the JWT cookie on every API request.

---

### CountdownTimer

Props: `remaining` (seconds), `timeLimit` (total seconds).

Renders a horizontal progress bar (`width = (remaining / timeLimit) * 100%`) with smooth CSS transition (`transition: width 0.9s linear`). The bar color shifts:
- `> 60%` remaining → green (`#22c55e`)
- `30–60%` → yellow (`#eab308`)
- `< 30%` → red (`#ef4444`)

A glow shimmer on the right edge of the bar is created with a pseudo-element gradient.

---

### LiveBarChart

Props: `votes` (array of counts), `options` (array of strings), `correctIndex` (null | number).

Wraps Recharts `<BarChart>` in a `<ResponsiveContainer>`. Uses the `votes` array to build chart data: `options.map((label, i) => ({ name: label, votes: votes[i] || 0 }))`.

Bar colors:
- While `correctIndex === null` (live voting): indigo (`#6366f1`).
- After reveal: green (`#22c55e`) for correct option, red (`#ef4444`) for all others.

Animation: `isAnimationActive={true}` with 500ms duration, so bars animate each time the vote count updates.

---

### Leaderboard

Props: `data` (array of player objects), `highlightId` (optional playerId string to highlight the current player's own row).

Renders one row per player with:
- Rank number styled gold (1st), silver (2nd), bronze (3rd) via CSS classes.
- Color-coded avatar with initials (cycles through 8 color presets).
- Player name, "(YOU)" badge if `highlightId` matches, active green dot.
- Score (formatted with `toLocaleString()` for comma separators).
- Rank change indicator: ▲N (green) or ▼N (red) if `rankChange !== 0`.

Handles both `playerId` and `id` field names to be compatible with both server-side and socket-side player objects.

---

### QRCodeDisplay

Renders a QR code for the join URL using `qrcode.react`. The URL encoded is `${window.location.origin}/join/${roomCode}`. Size is 180×180 by default.

---

### QuestionCard

Props: `question`, `myAnswer`, `correctIndex`, `onAnswer`, `disabled`.

Renders the question text and 2–4 answer buttons labeled A, B, C, D. Button state logic:

- Default: all buttons neutral (indigo outline).
- After `myAnswer` is set: selected button highlighted (filled indigo).
- After `correctIndex` is revealed: correct button turns green, wrong buttons turn red. The previously selected button is also highlighted to show if the player was right or wrong.
- `disabled` prop prevents clicking after answer submitted or during reveal phase.

---

### Topbar

Reusable header bar used on `HostLobby` and `HostLive`. Accepts `title`, `center`, `onMenuClick` (for mobile sidebar), and `children` (right-side action buttons).

---

### Sidebar

Reusable navigation sidebar for host pages. Accepts `open` prop for mobile drawer behavior. Nav items styled with `active` class for the current section.

---

### ThemeToggle

A small icon button that calls `toggle()` from `ThemeContext`. Renders a sun icon in dark mode, moon icon in light mode.

---

### LiquidEther (Background)

**File:** `src/components/backgroud/LiquidEther.jsx`

An interactive WebGL fluid simulation rendered as a full-screen background canvas. Implemented entirely in JavaScript using Three.js r128 — no external fluid simulation library.

**How it works:**

The simulation implements a real-time Navier-Stokes fluid solver on the GPU using render-to-texture (RTT) passes:

1. **Advection** — moves the velocity field along itself (with optional BFECC for accuracy).
2. **ExternalForce** — applies a gaussian splat force at the mouse/touch position.
3. **Viscous diffusion** (optional) — iterative Jacobi solver for viscous fluids.
4. **Divergence** — computes divergence of the velocity field.
5. **Poisson pressure** — iterative solver to find pressure that makes the field divergence-free.
6. **Pressure projection** — subtracts pressure gradient from velocity to enforce incompressibility.
7. **Color output** — maps velocity magnitude to a palette texture for rendering.

**Auto-demo mode:** When `autoDemo={true}` and no user interaction has occurred within `autoResumeDelay` ms, an `AutoDriver` class moves a virtual cursor smoothly between random targets, creating continuous fluid motion without user input.

**Performance optimizations:**
- `IntersectionObserver` pauses the `requestAnimationFrame` loop when the canvas is not in the viewport.
- `document.visibilitychange` event pauses rendering when the tab is hidden.
- `ResizeObserver` debounces resize events with `requestAnimationFrame`.
- Float textures use `HalfFloatType` on iOS for compatibility.

**Props (all optional):**
- `colors` — array of hex colors for the palette gradient (default: `['#5227FF', '#FF9FFC', '#B497CF']`).
- `mouseForce` — force applied at cursor (default: 20).
- `cursorSize` — size of the force splat (default: 100).
- `resolution` — FBO resolution as fraction of screen size (default: 0.5).
- `dt` — simulation time step (default: 0.014).
- `BFECC` — enables Back and Forth Error Compensation for advection (default: true).
- `isViscous` — enables viscous diffusion pass (default: false).
- `autoDemo` — enables autonomous animation (default: true).

---

## Hooks

### useAuth

Pure utility functions, not a hook in the React sense (no `useState`/`useEffect`).

`getUser()` — JSON.parse from localStorage with null safety.  
`saveAuth(user)` / `setUser(user)` — JSON.stringify to localStorage.  
`clearAuth()` — removeItem from localStorage.  
`isLoggedIn()` — returns `!!getUser()`.

### useSessionGuard

A hook that runs one `useEffect` on mount. Returns `checked` boolean state (initially `false`, set to `true` when the check completes). During the check, navigation is blocked to prevent flash-of-wrong-content. The effect is cancellable via a `cancelled` flag to prevent navigation after unmount (e.g. in React StrictMode's double-invoke).

---

## Theme System

Themes are implemented via CSS custom properties on `document.documentElement`. When `data-theme="dark"`, the `:root` rule in `index.css` defines one set of values; `[data-theme="light"]` overrides them.

Key CSS variables:
- `--bg`, `--bg2`, `--bg3` — background layers.
- `--text`, `--text2`, `--text3` — text hierarchy.
- `--border`, `--border2` — border colors.
- `--indigo-l`, `--green-l`, `--amber` — accent colors.
- `--r`, `--r2` — border radius tokens.
- `--card` — card background.

All component styles use these variables, making theme switching instant and requiring no component re-renders.

---

## Vite Configuration & Proxy

**File:** `vite.config.js`

```js
server: {
  host: true,
  port: 5173,
  proxy: {
    '/api': {
      target: 'http://localhost:5000',
      changeOrigin: true
    },
    '/socket.io': {
      target: 'http://localhost:5000',
      ws: true        
    }
  }
}
```

The proxy eliminates CORS configuration during development. Both REST and WebSocket connections to the backend go through `/api` and `/socket.io` respectively, which Vite forwards to `localhost:5000`. In production, `VITE_SERVER_URL` is set to the deployed backend URL and the proxy is unused.

---

## Socket Event Reference

### Events Emitted by Client

| Event | Payload | Who | Description |
|-------|---------|-----|-------------|
| `host:join` | `{ roomCode }` | Host | Join/rejoin the host room |
| `player:join` | `{ roomCode, playerName, playerId }` | Player | Join or rejoin as a player |
| `player:leave` | `{ roomCode, playerId }` | Player | Explicit leave (marks inactive) |
| `quiz:start` | `{ roomCode }` | Host | Start the quiz |
| `player:answer` | `{ roomCode, questionIndex, optionIndex, playerId }` | Player | Submit an answer |
| `quiz:reveal` | `{ roomCode }` | Host | Reveal answer manually |
| `quiz:next` | `{ roomCode }` | Host | Advance to next question |
| `quiz:end` | `{ roomCode }` | Host | End the session |
| `host:cancel` | `{ roomCode }` | Host | Cancel and delete the session |

### Events Received by Client

| Event | Payload | Handler in |
|-------|---------|------------|
| `host:joined` | `{ roomCode, status, players, currentQuestion }` | HostLobby, HostLive |
| `player:joined` | `{ roomCode, quizTitle, status, currentQuestion, score }` | PlayerLobby, PlayerGame |
| `room:players` | `{ count, players }` | HostLobby, PlayerLobby |
| `quiz:question` | `{ index, totalQuestions, text, options, timeLimit }` | HostLobby→nav, HostLive, PlayerGame |
| `quiz:stats` | `{ votes, totalAnswered, totalPlayers }` | HostLive |
| `quiz:result` | `{ correctIndex, votes, leaderboard, pointsMap, questionIndex }` | HostLive, PlayerGame |
| `timer:tick` | `{ remaining }` | HostLive, PlayerGame |
| `quiz:ended` | `{ finalLeaderboard, sessionId }` | HostLive, PlayerGame |
| `answer:received` | `{ questionIndex, optionIndex }` | PlayerGame |
| `session_canceled` | — | PlayerLobby, PlayerGame |
| `host:disconnected` | `{ message }` | PlayerGame |
| `error` | `{ message }` | All |

---

## LocalStorage Keys

| Key | Set by | Cleared by | Contents |
|-----|--------|-----------|----------|
| `user` | `saveAuth()` on login/register | `clearAuth()` on logout/delete | `{ id, name, email, createdAt }` |
| `qp-theme` | ThemeContext on theme change | Never | `'dark'` or `'light'` |
| `qp_active_session` | `setActiveSession()` in lobby/game pages | `clearActiveSession()` on end/cancel | `{ role, roomCode, sessionId?, playerId?, playerName? }` |
| `qp_playerId` | `useSessionGuard` on player reconnect | `handlePlayAgain` / `PlayerGame` cleanup | UUID string |
| `qp_playerName` | `useSessionGuard` on player reconnect | `handlePlayAgain` / `PlayerGame` cleanup | Display name string |
| `qp_roomCode` | `JoinPage` before navigating | `PlayerGame` cleanup | Room code string |
| `qp_session_ended` | `PlayerGame` on `quiz:ended` | `resetSession()` | `{ roomCode, sessionId, finalLeaderboard }` |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SERVER_URL` | Production only | Full URL of the backend (e.g. `https://your-app.onrender.com`). Empty string in development (proxy handles routing). |

---

## Development Setup

```bash
# From the repository root
cd client
npm install
npm run dev
# App runs at http://localhost:5173
# Vite proxies /api and /socket.io to localhost:5000
```

The backend must be running on port 5000 for the proxy to work. See the server README for backend setup.

**Available scripts:**
- `npm run dev` — start Vite dev server with HMR.
- `npm run build` — production build to `dist/`.
- `npm run preview` — preview the production build locally.
- `npm run lint` — run ESLint.
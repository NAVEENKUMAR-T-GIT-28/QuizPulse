<div align="center">

# ⚡ QuizPulse

**Real-time interactive quiz platform — host live sessions, engage your audience, and export results.**

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)](https://mongodb.com)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.x-010101?logo=socket.io)](https://socket.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[Live Demo](https://quizpulse.vercel.app) · [Report Bug](https://github.com/yourusername/QuizPulse/issues) · [Request Feature](https://github.com/yourusername/QuizPulse/issues)

</div>

---

## 📖 Table of Contents

- [About the Project](#about-the-project)
- [Key Features](#key-features)
- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [Running Locally](#running-locally)
  - [Running with Docker](#running-with-docker)
- [How It Works](#how-it-works)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

---

## About the Project

QuizPulse is a **full-stack real-time quiz application** inspired by Kahoot. Hosts create quiz sessions that players join via a 6-character room code (or QR scan). Questions are presented live, scores are calculated based on correctness and answer speed, and results are available immediately after the session ends — including PDF export.

The project is split into two independent packages:

| Package | Technology | Purpose |
|---------|-----------|---------|
| `client/` | React 19 + Vite + Zustand | Player & host browser interface |
| `server/` | Node.js + Express + Socket.io | API, real-time events, PDF generation |

---

## Key Features

**For Hosts**
- 🔐 Secure registration with email OTP verification
- 📝 Quiz builder — up to 25 questions, 2–4 options each, per-question or quiz-wide timers
- 🚀 One-click session launch with auto-generated room code
- 📊 Live vote bar chart updates as players answer
- 🏆 Real-time leaderboard with rank change indicators
- 📄 Export session results to PDF (high-quality Puppeteer or fallback PDFKit)
- 📜 Full session history with per-session drill-down

**For Players**
- 🎮 Join instantly via room code or QR scan — no account required
- ⏱️ Speed-based scoring (correct answer + time bonus up to 1,000 points)
- 🔄 Reconnect mid-game — score and identity are preserved
- 📱 Mobile-friendly responsive layout

**Platform**
- 🌙 Dark / Light theme with `data-theme` CSS variable system
- 🛡️ JWT httpOnly cookies, bcrypt hashing, Helmet security headers, rate limiting
- ♻️ Session recovery on browser tab close / refresh

---

## Architecture Overview

```
Browser (Host)           Browser (Player)
     │                         │
     │ HTTP REST + Cookie      │ HTTP REST
     │ WebSocket (Socket.io)   │ WebSocket (Socket.io)
     ▼                         ▼
┌─────────────────────────────────────────┐
│           Express Server (Node.js)      │
│                                         │
│  ┌───────────┐  ┌───────────┐           │
│  │ REST API  │  │ Socket.io │           │
│  │/api/auth  │  │ quizSocket│           │
│  │/api/quiz  │  │           │           │
│  │/api/sess  │  └───────────┘           │
│  │/api/export│                          │
│  └───────────┘                          │
└──────────────────┬──────────────────────┘
                   │ Mongoose
                   ▼
            ┌─────────────┐
            │  MongoDB    │
            │  Atlas      │
            │  ─────────  │
            │  User       │
            │  Quiz       │
            │  Session    │
            │  Otp (TTL)  │
            └─────────────┘
```

**Real-time flow during a live session:**
1. Host emits `quiz:start` → server broadcasts `quiz:question` to all room members
2. Players emit `player:answer` → server updates in-memory vote counters + emits `quiz:stats` to host
3. Server auto-reveals when timer hits 0 (or host emits `quiz:reveal`)
4. Server emits `quiz:result` with `correctIndex`, votes, leaderboard, and per-player `pointsMap`
5. Host emits `quiz:next` or `quiz:end` to advance/finish

---

## Tech Stack

### Frontend (`client/`)
| Tool | Version | Role |
|------|---------|------|
| React | 19 | UI framework |
| Vite | 8 | Build tool & dev server |
| React Router DOM | 7 | Client-side routing |
| Zustand | 5 | Global state management |
| Socket.io Client | 4 | WebSocket communication |
| Axios | 1 | HTTP requests |
| Recharts | 3 | Live vote bar charts |
| qrcode.react | 4 | QR code display in lobby |
| Three.js | 0.184 | Animated background (LiquidEther) |

### Backend (`server/`)
| Tool | Version | Role |
|------|---------|------|
| Node.js | 18+ | Runtime |
| Express | 4 | HTTP framework |
| Socket.io | 4 | WebSocket server |
| Mongoose | 8 | MongoDB ODM |
| bcryptjs | 2 | Password & OTP hashing |
| jsonwebtoken | 9 | JWT auth tokens |
| Nodemailer | 8 | OTP email delivery |
| PDFKit | 0.18 | Fallback PDF generation |
| Puppeteer | 21 | High-quality PDF (optional) |
| Helmet | 8 | HTTP security headers |
| express-rate-limit | 8 | API rate limiting |
| sanitize-html | 2 | Player name XSS protection |

---

## Project Structure

```
QuizPulse/
├── client/                  # React frontend
│   ├── src/
│   │   ├── api/             # Axios API layer (quizApi.js)
│   │   ├── components/      # Reusable UI components
│   │   ├── context/         # Theme & session context
│   │   ├── hooks/           # useAuth, useSessionGuard
│   │   ├── pages/           # Route-level page components
│   │   ├── socket/          # Socket.io singleton
│   │   ├── store/           # Zustand global store
│   │   ├── App.jsx          # Router & ErrorBoundary
│   │   └── main.jsx         # React entry point
│   ├── public/
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── server/                  # Express backend
│   ├── middleware/          # JWT auth middleware
│   ├── models/              # Mongoose schemas (User, Quiz, Session, Otp)
│   ├── routes/              # REST API routes
│   ├── services/            # Business logic & PDF generation
│   ├── socket/              # Socket.io event handlers
│   ├── utils/               # DB helpers, asyncHandler, roomCode
│   ├── test/                # Jest test suites
│   ├── server.js            # Entry point
│   ├── .env.example
│   └── package.json
│
├── package.json             # Root scripts (optional workspace)
├── .gitignore
├── LICENSE
└── README.md
```

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18 (LTS recommended)
- **npm** ≥ 9
- **MongoDB Atlas** account (free tier is sufficient)
- **Gmail** account with App Password (for OTP emails)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/NAVEENKUMAR-T-GIT-28/QuizPulse.git
cd QuizPulse

# 2. Install server dependencies
cd server && npm install

# 3. Install client dependencies
cd ../client && npm install
```

### Environment Variables

Copy the example file and fill in your values:

```bash
cd server
cp .env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | ✅ | Server port (default: 5000) |
| `NODE_ENV` | ✅ | `development` or `production` |
| `MONGODB_URI` | ✅ | MongoDB Atlas connection string |
| `JWT_SECRET` | ✅ | Long random string for JWT signing |
| `CLIENT_URL` | ✅ | Frontend URL for CORS (comma-separated for multiple) |
| `SMTP_USER` | ✅ | Gmail address for OTP sending |
| `SMTP_PASS` | ✅ | Gmail App Password |
| `ENABLE_PUPPETEER` | ❌ | `true` to enable high-quality PDF (needs 512MB+ RAM) |

Generate a secure `JWT_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Running Locally

**Terminal 1 — Backend:**
```bash
cd server
npm run dev       # nodemon watches for changes
# Server starts on http://localhost:5000
```

**Terminal 2 — Frontend:**
```bash
cd client
npm run dev       # Vite dev server with HMR
# App opens at http://localhost:5173
```

The Vite dev server proxies `/api` and `/socket.io` requests to `localhost:5000`, so no CORS configuration is needed during development.

**Run backend tests:**
```bash
cd server
npm test          # Jest with in-memory MongoDB
```

---

### Running with Docker

QuizPulse is fully dockerized for a consistent development and deployment environment.

#### Docker Images
You can pull the latest images directly from Docker Hub:
- **Client**: `docker pull naveen282006/quizpulse-client:latest`
- **Server**: `docker pull naveen282006/quizpulse-server:latest`

> 🐳 **Detailed Documentation**: For a deep dive into the Docker architecture, volumes, and security constraints, see the [README.Docker.md](./README.Docker.md) file. Separate guides for [Client](./client/README.Docker.md) and [Server](./server/README.Docker.md) are also available in their respective directories.

### 1. Configure Environment Variables
Ensure you have the following `.env` files set up in their respective directories (these are ignored by `.gitignore`):

*   **`server/.env`**: Contains backend variables (`MONGODB_URI`, `JWT_SECRET`, `SMTP_USER`, `SMTP_PASS`).
    *   *Note: Use `MONGODB_URI=mongodb://mongodb:27017/QuizApp` to connect to the containerized database.*
*   **`client/.env`**: Contains `VITE_SERVER_URL=http://localhost:5000`.

### 2. Launch the Application
Run these commands from the directory where you cloned the repository:

```bash
cd QuizPulse
docker-compose up --build
```

### 3. Access the Services
*   **Frontend**: [http://localhost:5173](http://localhost:5173)
*   **Backend API**: [http://localhost:5000](http://localhost:5000)
*   **MongoDB**: Accessible internally at `mongodb:27017` or externally at `localhost:27017`.

### Docker Architecture & Security
- **Security**: Containers run as non-root users (`node` for backend, `nginx` for frontend) to minimize security risks.
- **Resource Constraints**: CPU and Memory limits are applied to all services to ensure host stability.
- **Persistence**: Database records are stored in a persistent Docker volume (`mongodb-data`).
- **Isolation**: All services communicate over a private bridge network (`quizpulse-network`).

---

## How It Works

### Registration Flow (Email OTP)
1. User submits name, email, password → `POST /api/auth/register/initiate`
2. Server hashes password, generates cryptographic 6-digit OTP, stores in `Otp` collection (10-min TTL), emails the code
3. User submits OTP → `POST /api/auth/register/verify`
4. Server compares hashed OTP (max 5 attempts), creates `User` document, issues JWT httpOnly cookie

### Quiz Session Lifecycle
```
Host creates quiz → Launches session (POST /api/quiz/:id/session)
        ↓
Host joins lobby (/lobby/:roomCode) — WebSocket room created
        ↓
Players join via room code (/join) — navigate to /lobby/:roomCode/wait
        ↓
Host starts quiz → quiz:question broadcast → all navigate to game
        ↓
[Per question: players answer → votes update live on host screen]
        ↓
Timer auto-reveals OR host manually reveals → scores calculated
        ↓
Host advances (quiz:next) or ends (quiz:end)
        ↓
Session saved as 'ended' → results & PDF export available
```

### Scoring Algorithm
- **Base points:** 500 per correct answer
- **Speed bonus:** up to 500 additional points, scaled linearly by how quickly the player answered relative to the time limit
- **Formula:** `points = 500 + floor((1 - elapsed/timeLimit) × 500)`

---

## Deployment

### Backend — Render (Free Tier)
1. Create a **Web Service** pointing to the `server/` directory
2. Build command: `npm install`
3. Start command: `npm start`
4. Add all environment variables from `.env.example`
5. Set `ENABLE_PUPPETEER=false` on free tier (insufficient RAM)

### Frontend — Vercel
1. Import the repository, set **Root Directory** to `client/`
2. Framework preset: **Vite**
3. Add environment variable: `VITE_SERVER_URL=https://your-render-url.onrender.com`

> **Important:** Add your Vercel domain to the server's `CLIENT_URL` environment variable for CORS.

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit with conventional commits: `git commit -m 'feat: add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

---

<div align="center">

Built by **Naveenkumar T** · [⭐ Star this repo](https://github.com/yourusername/QuizPulse)

</div>

import { create } from 'zustand'

const useQuizStore = create((set) => ({
  // Session identifiers
  roomCode: null,
  sessionId: null,

  // Session lifecycle status
  // Possible values: 'idle' | 'waiting' | 'live' | 'revealing' | 'ended'
  status: 'idle',

  // Quiz content
  questions: [],
  currentIndex: 0,
  currentQuestion: null,   // { text, options, timeLimit, index, totalQuestions }

  // Live data updated by socket events
  players: [],             // [{ name, id }] — shown in host lobby
  votes: [],               // [12, 5, 8, 3] — vote counts per option
  leaderboard: [],         // [{ rank, name, score, rankChange }]
  timer: null,             // seconds remaining (from timer:tick)

  // Player-specific state
  playerId: null,
  playerName: null,
  myAnswer: null,          // optionIndex the player selected (null = not answered)
  myScore: 0,
  isCorrect: null,         // true/false shown after reveal

  // Actions
  setRoom:        (roomCode, sessionId) => set({ roomCode, sessionId }),
  setStatus:      (status) => set({ status }),
  setQuestion:    (q) => set({ currentQuestion: q, currentIndex: q.index, myAnswer: null, isCorrect: null, votes: new Array(q.options?.length || 4).fill(0) }),
  setVotes:       (votes) => set({ votes }),
  setLeaderboard: (leaderboard) => set({ leaderboard }),
  setPlayers:     (players) => set({ players }),
  setTimer:       (timer) => set({ timer }),
  setMyAnswer:    (myAnswer) => set({ myAnswer }),
  setMyResult:    (isCorrect, pointsThisRound) => set((state) => ({
    isCorrect,
    myScore: state.myScore + (pointsThisRound || 0),
  })),
  setPlayerId:    (playerId) => set({ playerId }),
  setPlayerName:  (playerName) => set({ playerName }),
  resetSession:   () => {
    localStorage.removeItem('qp_session_ended')
    set({
      roomCode: null, sessionId: null, status: 'idle',
      questions: [], currentIndex: 0, currentQuestion: null,
      votes: [], leaderboard: [], players: [],
      myAnswer: null, isCorrect: null, timer: null, myScore: 0,
    })
  },
}))

export default useQuizStore
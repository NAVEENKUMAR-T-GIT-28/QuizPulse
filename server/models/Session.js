const mongoose = require('mongoose')

const PlayerSchema = new mongoose.Schema(
  {
    playerId: {
      type: String,
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    score: {
      type: Number,
      default: 0,
    },

    active: {
      type: Boolean,
      default: true,
    },

    lastJoinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
)

const ResponseSchema = new mongoose.Schema(
  {
    playerId: {
      type: String,
      required: true,
    },

    questionIndex: {
      type: Number,
      required: true,
    },

    optionIndex: {
      type: Number,
      required: true,
    },

    isCorrect: {
      type: Boolean,
      default: false,
    },

    pointsAwarded: {
      type: Number,
      default: 0,
    },

    answeredAt: {
      type: Date,
      default: Date.now,
    },
  },

  /**
   * IMPORTANT:
   * Keep _id enabled for response-level updates.
   * Required for efficient bulkWrite positional updates.
   */
  { _id: true }
)

const VoteSnapshotSchema = new mongoose.Schema(
  {
    questionIndex: {
      type: Number,
      required: true,
    },

    votes: {
      type: [Number],
      default: [],
    },
  },

  { _id: false }
)

const SessionSchema = new mongoose.Schema({
  quizId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Quiz',
    required: true,
  },

  hostId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  roomCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },

  status: {
    type: String,
    enum: [
      'waiting',
      'live',
      'revealing',
      'ended',
    ],
    default: 'waiting',
  },

  currentIndex: {
    type: Number,
    default: 0,
  },

  players: {
    type: [PlayerSchema],
    default: [],
  },

  responses: {
    type: [ResponseSchema],
    default: [],
  },

  voteSnapshots: {
    type: [VoteSnapshotSchema],
    default: [],
  },

  questionOpenedAt: {
    type: Date,
  },

  startedAt: {
    type: Date,
  },

  endedAt: {
    type: Date,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
})

/**
 * Performance indexes
 */

SessionSchema.index(
  { roomCode: 1 },
  { unique: true }
)

SessionSchema.index({ hostId: 1 })

SessionSchema.index({ createdAt: -1 })

SessionSchema.index({
  'responses.questionIndex': 1,
})

SessionSchema.index({
  'responses.playerId': 1,
})

SessionSchema.index({
  'players.playerId': 1,
})

/**
 * Auto-delete sessions after 90 days
 */
SessionSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds:
      90 * 24 * 60 * 60,
  }
)

module.exports = mongoose.model(
  'Session',
  SessionSchema
)
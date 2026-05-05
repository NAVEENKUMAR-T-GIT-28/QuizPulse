const mongoose = require('mongoose')

const PlayerSchema = new mongoose.Schema({
  playerId: { type: String, required: true },
  name:     { type: String, required: true, trim: true },
  score:    { type: Number, default: 0 },
  active:   { type: Boolean, default: true }
}, { _id: false })

const ResponseSchema = new mongoose.Schema({
  playerId:        { type: String, required: true },
  questionIndex:   { type: Number, required: true },
  optionIndex:     { type: Number, required: true },
  isCorrect:       { type: Boolean, required: true },
  pointsAwarded:   { type: Number, default: 0 },
  answeredAt:      { type: Date, default: Date.now }
}, { _id: false })

const VoteSnapshotSchema = new mongoose.Schema({
  questionIndex: { type: Number, required: true },
  votes:         { type: [Number], default: [] }
}, { _id: false })

const SessionSchema = new mongoose.Schema({
  quizId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Quiz',
    required: true
  },
  hostId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  roomCode: {
    type: String,
    required: true,
    unique: true,
    index: true,
    uppercase: true
  },
  status: {
    type: String,
    enum: ['waiting', 'live', 'revealing', 'ended'],
    default: 'waiting'
  },
  currentIndex: {
    type: Number,
    default: 0
  },
  players:       { type: [PlayerSchema],      default: [] },
  responses:     { type: [ResponseSchema],    default: [] },
  voteSnapshots: { type: [VoteSnapshotSchema], default: [] },
  questionOpenedAt: { type: Date },
  startedAt:     { type: Date },
  endedAt:       { type: Date },
  createdAt:     { type: Date, default: Date.now }
})

SessionSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 }  // 90 days
)

module.exports = mongoose.model('Session', SessionSchema)
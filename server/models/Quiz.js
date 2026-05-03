const mongoose = require('mongoose')

const QuestionSchema = new mongoose.Schema({
  text: {
    type: String,
    required: [true, 'Question text is required'],
    trim: true,
    maxlength: [500, 'Question cannot exceed 500 characters']
  },
  options: {
    type: [String],
    validate: {
      validator: (arr) => arr.length >= 2 && arr.length <= 4,
      message: 'Each question must have between 2 and 4 options'
    }
  },
  correctIndex: {
    type: Number,
    required: [true, 'Correct answer index is required'],
    min: 0,
    max: 3
  },
  timeLimit: {
    type: Number,
    default: 10,
    min: 5,
    max: 120
  }
})

const QuizSchema = new mongoose.Schema({
  hostId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: [true, 'Quiz title is required'],
    trim: true,
    maxlength: [120, 'Title cannot exceed 120 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [300, 'Description cannot exceed 300 characters'],
    default: ''
  },
  // 'per-question' — each question uses its own timeLimit (default)
  // 'quiz'         — all questions share a single quizTimeLimit value
  timerMode: {
    type: String,
    enum: ['per-question', 'quiz'],
    default: 'per-question'
  },
  // Used only when timerMode === 'quiz'
  quizTimeLimit: {
    type: Number,
    default: 10,
    min: 5,
    max: 300
  },
  questions: {
    type: [QuestionSchema],
    validate: {
      validator: (arr) => arr.length >= 1,
      message: 'Quiz must have at least one question'
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
})

QuizSchema.pre('save', function (next) {
  this.updatedAt = Date.now()
  next()
})

// Cascade: when a quiz is deleted, remove all its sessions
QuizSchema.post('findOneAndDelete', async function (doc) {
  if (!doc) return
  const Session = mongoose.model('Session')
  await Session.deleteMany({ quizId: doc._id })
})

module.exports = mongoose.model('Quiz', QuizSchema)
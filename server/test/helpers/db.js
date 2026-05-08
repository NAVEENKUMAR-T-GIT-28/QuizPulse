const mongoose = require('mongoose')

const TEST_DB_URI =
  process.env.MONGODB_URI ||
  'mongodb://127.0.0.1:27017/quizpulse-test'

async function connect() {
  if (mongoose.connection.readyState === 1) {
    return
  }

  await mongoose.connect(TEST_DB_URI, {
    serverSelectionTimeoutMS: 5000,
  })
}

async function disconnect() {
  try {
    await mongoose.connection.dropDatabase()
  } catch (_) {
    // ignore cleanup errors
  }

  await mongoose.disconnect()
}

async function clearCollections() {
  const { collections } = mongoose.connection

  await Promise.all(
    Object.values(collections).map((collection) =>
      collection.deleteMany({})
    )
  )
}

module.exports = {
  connect,
  disconnect,
  clearCollections,
}
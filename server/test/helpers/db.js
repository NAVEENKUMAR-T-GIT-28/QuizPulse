const mongoose = require('mongoose')

// ─── Safety: NEVER connect to production DB from tests ────────────────────────
//
// Tests must use TEST_MONGODB_URI (a dedicated quizpulse-test database).
// If TEST_MONGODB_URI is not set, we fall back to local MongoDB.
// We NEVER fall back to MONGODB_URI — that is the production/staging database.
//
const TEST_DB_URI =
  process.env.TEST_MONGODB_URI ||
  'mongodb://127.0.0.1:27017/quizpulse-test'

// Hard guard: abort immediately if someone accidentally points TEST_MONGODB_URI
// at an Atlas production cluster without a clearly test-named database.
// Atlas URIs look like: mongodb+srv://...@cluster.mongodb.net/<dbname>
const dbName = TEST_DB_URI.split('/').pop().split('?')[0]
const isAtlas = TEST_DB_URI.includes('mongodb.net') || TEST_DB_URI.includes('mongodb+srv')
const isSafeTestDb = dbName.toLowerCase().includes('test')

if (isAtlas && !isSafeTestDb) {
  throw new Error(
    `[TEST SAFETY] TEST_MONGODB_URI points to an Atlas database named "${dbName}" ` +
    `which does not contain "test" in its name. ` +
    `Set TEST_MONGODB_URI to a dedicated test database (e.g. quizpulse-test) ` +
    `to prevent accidental data loss on production.`
  )
}

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
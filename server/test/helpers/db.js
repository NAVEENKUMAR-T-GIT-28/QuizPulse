// server/test/helpers/db.js
//
// Each test suite (auth, quiz, socket) calls connect() in beforeAll and
// disconnect() in afterAll. Jest runs suites in separate worker processes
// when using --runInBand the suites share a single process but each gets
// its own MongoMemoryServer instance via a module-local `mongod` variable.
//
// The teardown order:
//   1. dropDatabase()  — wipe all data (best-effort, skip if already gone)
//   2. mongoose.disconnect() — cleanly close the mongoose connection pool
//   3. mongod.stop()  — kill the mongod process
//
// Using mongoose.disconnect() instead of mongoose.connection.close() avoids
// the MongoClientClosedError that occurs when the connection pool is already
// in a closing state by the time close() is called.

const mongoose             = require('mongoose')
const { MongoMemoryServer } = require('mongodb-memory-server')

let mongod

async function connect() {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
}

async function disconnect() {
  // dropDatabase is best-effort — skip gracefully if connection is already gone
  try {
    await mongoose.connection.dropDatabase()
  } catch (_) {
    // already closed or never fully opened — safe to ignore
  }

  // mongoose.disconnect() closes all connections in the pool cleanly
  // and is idempotent — calling it on an already-closed connection is safe.
  await mongoose.disconnect()

  if (mongod) {
    await mongod.stop()
    mongod = null
  }
}

async function clearCollections() {
  const { collections } = mongoose.connection
  await Promise.all(
    Object.values(collections).map(col => col.deleteMany({}))
  )
}

module.exports = { connect, disconnect, clearCollections }
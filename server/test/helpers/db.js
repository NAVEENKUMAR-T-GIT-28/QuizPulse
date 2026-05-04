// server/test/helpers/db.js

const mongoose           = require('mongoose')
const { MongoMemoryServer } = require('mongodb-memory-server')

let mongod

async function connect() {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
}

async function disconnect() {
  await mongoose.connection.dropDatabase()
  await mongoose.connection.close()
  await mongod.stop()
}

async function clearCollections() {
  const collections = mongoose.connection.collections
  for (const key in collections) {
    await collections[key].deleteMany({})
  }
}

module.exports = { connect, disconnect, clearCollections }
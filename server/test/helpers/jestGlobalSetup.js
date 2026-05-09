// test/helpers/jestGlobalSetup.js
//
// This runs ONCE before all test suites, in a separate Node.js process.
// It ensures the test suite can NEVER accidentally use the production database
// by clearing MONGODB_URI and setting a safe TEST_MONGODB_URI.
//
// Even if the shell or CI environment has MONGODB_URI set (pointing to Atlas),
// this setup prevents it from being inherited by test code.

module.exports = async function () {
  // Remove the production DB URI from the environment entirely
  delete process.env.MONGODB_URI

  // Set a dedicated test DB URI if one is not already configured
  if (!process.env.TEST_MONGODB_URI) {
    process.env.TEST_MONGODB_URI = 'mongodb://127.0.0.1:27017/quizpulse-test'
  }

  console.log(`\n[Jest] Using test database: ${process.env.TEST_MONGODB_URI}\n`)
}

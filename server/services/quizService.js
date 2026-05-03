const BASE_POINTS = 500
const MAX_SPEED_BONUS = 500

/**
 * Calculate points for a correct answer.
 * Faster answers get a speed bonus on top of BASE_POINTS.
 * Wrong answers always get 0.
 */
function calculatePoints(isCorrect, answeredAt, questionOpenedAt, timeLimit) {
  if (!isCorrect) return 0

  const elapsedSeconds = (new Date(answeredAt) - new Date(questionOpenedAt)) / 1000
  const timeRatio = Math.max(0, 1 - elapsedSeconds / timeLimit)
  const speedBonus = Math.floor(timeRatio * MAX_SPEED_BONUS)

  return BASE_POINTS + speedBonus
}

/**
 * Update a session's player scores after a question is revealed.
 * Returns the updated players array sorted by score (for leaderboard).
 */
function applyScores(session, questionIndex, questionOpenedAt, timeLimit) {
  const responses = session.responses.filter(
    (r) => r.questionIndex === questionIndex
  )

  for (const response of responses) {
    const points = calculatePoints(
      response.isCorrect,
      response.answeredAt,
      questionOpenedAt,
      timeLimit
    )
    response.pointsAwarded = points

    const player = session.players.find((p) => p.playerId === response.playerId)
    if (player) {
      player.score += points
    }
  }

  return [...session.players].sort((a, b) => b.score - a.score)
}

/**
 * Build a leaderboard array from a sorted players list.
 * Includes rank change compared to previous leaderboard snapshot.
 */
function buildLeaderboard(players, previousLeaderboard = []) {
  // Always ensure the array is sorted descending by score                                          
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score)

  return sortedPlayers.map((player, index) => {
    const prevRank = previousLeaderboard.findIndex(
      (p) => p.playerId === player.playerId
    )
    const rankChange = prevRank === -1 ? 0 : prevRank - index

    return {
      rank: index + 1,
      playerId: player.playerId,
      name: player.name,
      score: player.score,
      rankChange  // positive = moved up, negative = moved down
    }
  })
}

/**
 * Aggregates vote counts for a specific question.
 */
function getVoteStats(session, questionIndex, optionCount) {
  const votes = new Array(optionCount).fill(0)
  const responses = session.responses.filter((r) => r.questionIndex === questionIndex)

  for (const r of responses) {
    if (r.optionIndex >= 0 && r.optionIndex < optionCount) {
      votes[r.optionIndex]++
    }
  }

  return votes
}

/**
 * Handles the logic for revealing an answer:
 * 1. Mark responses as correct/wrong
 * 2. Calculate and apply points
 * 3. Generate vote snapshot
 * 4. Return summary for broadcast
 */
async function processReveal(session, quiz, resolvedTimeLimit) {
  const qIndex = session.currentIndex
  const question = quiz.questions[qIndex]
  const correctIndex = question.correctIndex

  // Use the resolved limit passed in from the socket handler
  const timeLimit = resolvedTimeLimit ?? question.timeLimit

  // 1. Mark responses for this question
  const responses = session.responses.filter((r) => r.questionIndex === qIndex)
  for (const r of responses) {
    r.isCorrect = (r.optionIndex === correctIndex)
  }

  // 2. Calculate and apply points (updates session.players in place)
  const sortedPlayers = applyScores(
    session,
    qIndex,
    session.questionOpenedAt,
    timeLimit
  )

  // Build a map of { playerId -> pointsAwarded } for this question
  const pointsMap = {}
  for (const r of responses) {
    pointsMap[r.playerId] = r.pointsAwarded
  }

  // 3. Generate and save vote snapshot
  const votes = getVoteStats(session, qIndex, question.options.length)
  session.voteSnapshots.push({ questionIndex: qIndex, votes })

  await session.save()

  // 4. Return results for the socket broadcast
  return {
    correctIndex,
    votes,
    leaderboard: buildLeaderboard(sortedPlayers),
    pointsMap,
  }
}

module.exports = {
  calculatePoints,
  applyScores,
  buildLeaderboard,
  getVoteStats,
  processReveal
}
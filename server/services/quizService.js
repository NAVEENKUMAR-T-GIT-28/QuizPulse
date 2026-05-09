const mongoose = require('mongoose')
const Session = require('../models/Session')

const BASE_POINTS = 500
const MAX_SPEED_BONUS = 500

/**
 * Calculate points for a correct answer.
 * Faster answers get a speed bonus on top of BASE_POINTS.
 * Wrong answers always get 0.
 */
function calculatePoints(isCorrect, answeredAt, questionOpenedAt, timeLimit) {
  if (!isCorrect) return 0

  const elapsedSeconds =
    (new Date(answeredAt) - new Date(questionOpenedAt)) / 1000

  const timeRatio = Math.max(
    0,
    1 - elapsedSeconds / timeLimit
  )

  const speedBonus = Math.floor(
    timeRatio * MAX_SPEED_BONUS
  )

  return BASE_POINTS + speedBonus
}

/**
 * Build leaderboard from players.
 */
function buildLeaderboard(players, previousLeaderboard = []) {
  const sortedPlayers = [...players].sort(
    (a, b) => b.score - a.score
  )

  return sortedPlayers.map((player, index) => {
    const prevRank = previousLeaderboard.findIndex(
      (p) => p.playerId === player.playerId
    )

    const rankChange =
      prevRank === -1 ? 0 : prevRank - index

    return {
      rank: index + 1,
      playerId: player.playerId,
      name: player.name,
      score: player.score,
      rankChange,
    }
  })
}

/**
 * Aggregate vote counts.
 */
function getVoteStats(responses, optionCount) {
  const votes = new Array(optionCount).fill(0)

  for (const r of responses) {
    if (
      r.optionIndex >= 0 &&
      r.optionIndex < optionCount
    ) {
      votes[r.optionIndex]++
    }
  }

  return votes
}

/**
 * Process reveal event.
 */
async function processReveal(
  session,
  quiz,
  resolvedTimeLimit
) {
  const qIndex = session.currentIndex

  const question = quiz.questions[qIndex]

  const correctIndex = question.correctIndex

  const timeLimit =
    resolvedTimeLimit ?? question.timeLimit

  /**
   * Fetch only current question responses
   */
  const aggResult = await Session.aggregate([
    {
      $match: {
        _id: session._id,
      },
    },
    {
      $unwind: '$responses',
    },
    {
      $match: {
        'responses.questionIndex': qIndex,
      },
    },
    {
      $group: {
        _id: null,
        responses: {
          $push: '$responses',
        },
      },
    },
  ])

  const responses =
    aggResult.length > 0
      ? aggResult[0].responses
      : []

  /**
   * O(1) player lookup
   */
  const playerMap = new Map(
    session.players.map((p) => [
      p.playerId,
      p,
    ])
  )

  const bulkOps = []

  const pointsMap = {}

  /**
   * Process responses
   */
  for (const r of responses) {
    const isCorrect =
      r.optionIndex === correctIndex

    const points = calculatePoints(
      isCorrect,
      r.answeredAt,
      session.questionOpenedAt,
      timeLimit
    )

    pointsMap[r.playerId] = points

    /**
     * Update player score
     */
    const player = playerMap.get(r.playerId)

    if (player) {
      player.score += points
    }

    /**
     * Safe ObjectId conversion
     */
    bulkOps.push({
      updateOne: {
        filter: {
          _id: session._id,
          'responses._id':
            new mongoose.Types.ObjectId(r._id),
        },
        update: {
          $set: {
            'responses.$.isCorrect':
              isCorrect,
            'responses.$.pointsAwarded':
              points,
          },
        },
      },
    })
  }

  /**
   * Batch update response subdocuments
   */
  if (bulkOps.length > 0) {
    await Session.bulkWrite(bulkOps)
  }

  /**
   * Generate votes
   */
  const votes = getVoteStats(
    responses,
    question.options.length
  )

  /**
   * Save vote snapshot
   */
  session.voteSnapshots.push({
    questionIndex: qIndex,
    votes,
  })

  /**
   * Save updated players + snapshots
   */
  await session.save()

  const sortedPlayers = Array.from(
    playerMap.values()
  ).sort((a, b) => b.score - a.score)

  return {
    correctIndex,
    votes,
    leaderboard:
      buildLeaderboard(sortedPlayers),
    pointsMap,
  }
}

module.exports = {
  calculatePoints,
  buildLeaderboard,
  getVoteStats,
  processReveal,
}
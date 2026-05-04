const { calculatePoints, buildLeaderboard, getVoteStats } = require('../../services/quizService')

describe('calculatePoints', () => {
  test('returns 0 for wrong answer', () => {
    const points = calculatePoints(false, new Date(), new Date(), 30)
    expect(points).toBe(0)
  })

  test('returns full points for instant correct answer', () => {
    const openedAt  = new Date('2024-01-01T00:00:00.000Z')
    const answeredAt = new Date('2024-01-01T00:00:00.100Z')  // 0.1s later
    const points = calculatePoints(true, answeredAt, openedAt, 30)
    expect(points).toBeGreaterThan(900)  // near max (500 base + ~500 speed bonus)
  })

  test('returns only base points for last-second answer', () => {
    const openedAt   = new Date('2024-01-01T00:00:00.000Z')
    const answeredAt = new Date('2024-01-01T00:00:29.900Z')  // 29.9s later
    const points = calculatePoints(true, answeredAt, openedAt, 30)
    expect(points).toBeGreaterThanOrEqual(500)
    expect(points).toBeLessThan(520)  // tiny speed bonus left
  })
})

describe('buildLeaderboard', () => {
  test('sorts players by score descending', () => {
    const players = [
      { playerId: 'a', name: 'Alice', score: 500 },
      { playerId: 'b', name: 'Bob',   score: 900 },
      { playerId: 'c', name: 'Carol', score: 700 },
    ]
    const lb = buildLeaderboard(players)
    expect(lb[0].name).toBe('Bob')
    expect(lb[1].name).toBe('Carol')
    expect(lb[2].name).toBe('Alice')
  })

  test('assigns correct ranks', () => {
    const players = [
      { playerId: 'a', name: 'Alice', score: 500 },
      { playerId: 'b', name: 'Bob',   score: 900 },
    ]
    const lb = buildLeaderboard(players)
    expect(lb[0].rank).toBe(1)
    expect(lb[1].rank).toBe(2)
  })
})

describe('getVoteStats', () => {
  test('counts votes per option correctly', () => {
    const session = {
      responses: [
        { questionIndex: 0, optionIndex: 0 },
        { questionIndex: 0, optionIndex: 0 },
        { questionIndex: 0, optionIndex: 2 },
        { questionIndex: 1, optionIndex: 1 },  // different question, should be ignored
      ]
    }
    const votes = getVoteStats(session, 0, 4)
    expect(votes).toEqual([2, 0, 1, 0])
  })

  test('returns all zeros for a question with no responses', () => {
    const session = { responses: [] }
    const votes = getVoteStats(session, 0, 4)
    expect(votes).toEqual([0, 0, 0, 0])
  })
})

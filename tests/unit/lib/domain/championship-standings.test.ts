import { describe, expect, it } from 'vitest'
import { blockingTies, closingOrder, decisivePlaces, groupStandings } from '@/lib/domain/championship-standings'
import { makeGroup, makeMatch, members, played, set } from '../../fixtures/championship-fixture'

const FOUR = makeGroup({ members: members(['e1', 'e2', 'e3', 'e4']) })
const ids = (rows: { entryId: string }[]) => rows.map((row) => row.entryId)

describe('groupStandings', () => {
  it('orders by matches won and counts sets and games', () => {
    const matches = [
      played('m1', 'e1', 'e2', 'a'),
      played('m2', 'e3', 'e4', 'a'),
      played('m3', 'e1', 'e3', 'a'),
      played('m4', 'e2', 'e4', 'a'),
      played('m5', 'e1', 'e4', 'a'),
      played('m6', 'e2', 'e3', 'a'),
    ]
    const standings = groupStandings(FOUR, matches)
    expect(ids(standings.rows)).toEqual(['e1', 'e2', 'e3', 'e4'])
    expect(standings.rows[0]).toEqual({
      entryId: 'e1',
      played: 3,
      won: 3,
      lost: 0,
      setsWon: 6,
      setsLost: 0,
      gamesWon: 36,
      gamesLost: 18,
    })
    expect(standings.complete).toBe(true)
    expect(standings.tied).toEqual([])
  })

  it('breaks a tie of two by the match between them', () => {
    const matches = [
      played('m1', 'e1', 'e2', 'b', [set(4, 6), set(4, 6)]),
      played('m2', 'e1', 'e3', 'a', [set(6, 0), set(6, 0)]),
      played('m3', 'e1', 'e4', 'a', [set(6, 0), set(6, 0)]),
      played('m4', 'e2', 'e3', 'b', [set(3, 6), set(3, 6)]),
      played('m5', 'e2', 'e4', 'a', [set(7, 6), set(7, 6)]),
      played('m6', 'e3', 'e4', 'b', [set(4, 6), set(4, 6)]),
    ]
    expect(ids(groupStandings(FOUR, matches).rows)).toEqual(['e2', 'e1', 'e4', 'e3'])
  })

  it('breaks a tie of three by set difference, then game difference', () => {
    const matches = [
      played('m1', 'e1', 'e2', 'a', [set(6, 0), set(6, 0)]),
      played('m2', 'e2', 'e3', 'a', [set(6, 4), set(6, 4)]),
      played('m3', 'e1', 'e3', 'b', [set(6, 7), set(6, 7)]),
      played('m4', 'e1', 'e4', 'a'),
      played('m5', 'e2', 'e4', 'a'),
      played('m6', 'e3', 'e4', 'a'),
    ]
    expect(ids(groupStandings(FOUR, matches).rows)).toEqual(['e1', 'e3', 'e2', 'e4'])
  })

  it('leaves to the organizer what is still level', () => {
    const three = makeGroup({ members: members(['e1', 'e2', 'e3']) })
    const matches = [played('m1', 'e1', 'e2', 'a'), played('m2', 'e2', 'e3', 'a'), played('m3', 'e3', 'e1', 'a')]
    const standings = groupStandings(three, matches)
    expect(standings.tied).toEqual([['e1', 'e2', 'e3']])
    expect(closingOrder(three, matches, 1)).toEqual({ ok: false, reason: 'tied', tied: [['e1', 'e2', 'e3']] })
  })

  it('only stops for a tie that decides a place', () => {
    const matches = [
      played('m1', 'e1', 'e2', 'a'),
      played('m2', 'e1', 'e3', 'a'),
      played('m3', 'e1', 'e4', 'a'),
      played('m4', 'e2', 'e3', 'a'),
      played('m5', 'e3', 'e4', 'a'),
      played('m6', 'e4', 'e2', 'a'),
    ]
    const standings = groupStandings(FOUR, matches)
    expect(standings.tied).toEqual([['e2', 'e3', 'e4']])
    expect(blockingTies(standings, 1)).toEqual([])
    expect(blockingTies(standings, 2)).toEqual([['e2', 'e3', 'e4']])
    expect(closingOrder(FOUR, matches, 1)).toEqual({ ok: true, order: ['e1', 'e2', 'e3', 'e4'] })
  })

  it('counts a W.O. as 6-0 6-0 and a super tie-break as one game', () => {
    const two = makeGroup({ members: members(['e1', 'e2']) })
    const walkover = makeMatch({ status: 'walkover', winner: 'e1', absent: 'e2', sets: [set(6, 0), set(6, 0)] })
    expect(groupStandings(two, [walkover]).rows[0]).toMatchObject({ entryId: 'e1', won: 1, gamesWon: 12, gamesLost: 0 })
    const superTiebreak = played('m1', 'e1', 'e2', 'a', [set(6, 4), set(4, 6), set(10, 8, true)])
    expect(groupStandings(two, [superTiebreak]).rows[0]).toMatchObject({
      setsWon: 2,
      setsLost: 1,
      gamesWon: 11,
      gamesLost: 10,
    })
  })

  it('does not close a group with matches to play', () => {
    const matches = [played('m1', 'e1', 'e2', 'a'), makeMatch({ id: 'm2', entryA: 'e3', entryB: 'e4' })]
    expect(closingOrder(FOUR, matches, 2)).toEqual({ ok: false, reason: 'incomplete', tied: [] })
  })
})

describe('decisivePlaces', () => {
  it('counts the qualifiers, or every place when everyone plays everyone', () => {
    expect(decisivePlaces({ format: 'groups_knockout', qualifiers: 2 }, 4)).toBe(2)
    expect(decisivePlaces({ format: 'groups_knockout', qualifiers: 2 }, 2)).toBe(1)
    expect(decisivePlaces({ format: 'round_robin', qualifiers: 2 }, 5)).toBe(5)
  })
})

import { describe, expect, it } from 'vitest'
import { pairRanking, ranking, rankingKey, scoreB, tournamentRanking } from '@/lib/domain/tournament-ranking'
import { makeGame } from '../../fixtures/tournaments'

const entry = (id: string, name: string) => ({ id, name })

describe('scoreB', () => {
  it('is what is left of the game', () => {
    expect(scoreB(14, 24)).toBe(10)
    expect(scoreB(0, 24)).toBe(24)
  })
})

describe('ranking', () => {
  const entries = [entry('e1', 'Ana'), entry('e2', 'Bruno'), entry('e3', 'Carla'), entry('e4', 'Dani')]

  it('adds points, games played, games won and difference; unrecorded games do not count', () => {
    const rows = ranking(
      entries,
      [
        makeGame('g1', ['e1', 'e2'], ['e3', 'e4'], 13),
        makeGame('g2', ['e1', 'e3'], ['e2', 'e4'], 11),
        makeGame('g3', ['e1', 'e4'], ['e2', 'e3'], 12),
        makeGame('g4', ['e1', 'e2'], ['e3', 'e4'], null),
      ],
      24,
    )
    expect(rows).toEqual([
      { entryId: 'e2', name: 'Bruno', position: 1, points: 38, played: 3, won: 2, diff: 4 },
      { entryId: 'e1', name: 'Ana', position: 2, points: 36, played: 3, won: 1, diff: 0 },
      { entryId: 'e4', name: 'Dani', position: 2, points: 36, played: 3, won: 1, diff: 0 },
      { entryId: 'e3', name: 'Carla', position: 4, points: 34, played: 3, won: 0, diff: -4 },
    ])
  })

  it('breaks ties by games won, then by difference', () => {
    const people = [entry('zoe', 'Zoe'), entry('ana', 'Ana'), entry('bea', 'Bea'), ...['f1', 'f2', 'f3', 'f4', 'f5', 'f6'].map((id) => entry(id, id))]
    const rows = ranking(
      people,
      [
        makeGame('g1', ['zoe', 'f1'], ['f2', 'f3'], 13),
        makeGame('g2', ['zoe', 'f4'], ['f5', 'f6'], 11),
        makeGame('g3', ['ana', 'f1'], ['f2', 'f4'], 12),
        makeGame('g4', ['ana', 'f5'], ['f3', 'f6'], 12),
        makeGame('g5', ['bea', 'f2'], ['f3', 'f4'], 24),
      ],
      24,
    )
    const order = rows.filter((row) => ['zoe', 'ana', 'bea'].includes(row.entryId)).map((row) => row.entryId)
    expect(order).toEqual(['bea', 'zoe', 'ana'])
  })

  it('lists everyone at zero before the first result', () => {
    expect(ranking(entries, [], 24).map((row) => [row.name, row.position, row.points])).toEqual([
      ['Ana', 1, 0],
      ['Bruno', 1, 0],
      ['Carla', 1, 0],
      ['Dani', 1, 0],
    ])
  })
})

describe('pairRanking', () => {
  const entries = [
    { id: 'a', name: 'Ana', pairId: 'p1' },
    { id: 'b', name: 'Bruno', pairId: 'p1' },
    { id: 'c', name: 'Carla', pairId: 'p2' },
    { id: 'd', name: 'Dani', pairId: 'p2' },
    { id: 'e', name: 'Eva', pairId: 'p3' },
    { id: 'f', name: 'Fede', pairId: 'p3' },
  ]

  it('one row per pair, under both names', () => {
    const rows = pairRanking(entries, [makeGame('g1', ['a', 'b'], ['c', 'd'], 16), makeGame('g2', ['e', 'f'], ['a', 'b'], 10)], 24)
    expect(rows.map((row) => [row.position, row.entryId, row.name, row.points, row.won])).toEqual([
      [1, 'p1', 'Ana y Bruno', 30, 2],
      [2, 'p3', 'Eva y Fede', 10, 0],
      [3, 'p2', 'Carla y Dani', 8, 0],
    ])
  })

  it('tournamentRanking picks per pair with fixed pairs, and rankingKey finds the pair of an entry', () => {
    const tournament = { format: 'fixed_pairs' as const, entries: entries.map((entry) => ({ ...entry, playerId: null, isGuest: true, payments: [] })), games: [], pointsPerGame: 24 }
    expect(tournamentRanking(tournament)).toHaveLength(3)
    expect(tournamentRanking({ ...tournament, format: 'rotating' })).toHaveLength(6)
    expect(rankingKey(tournament, 'c')).toBe('p2')
    expect(rankingKey({ ...tournament, format: 'rotating' }, 'c')).toBe('c')
  })
})

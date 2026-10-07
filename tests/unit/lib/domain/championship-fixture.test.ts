import { describe, expect, it } from 'vitest'
import {
  isDone,
  knockoutCode,
  knockoutLabel,
  matchName,
  readSource,
  roundName,
  scoreText,
  sideName,
  toFixture,
  type MatchRow,
} from '@/lib/domain/championship-fixture'
import { makeGroup, makeMatch, members, set } from '../../fixtures/championship-fixture'

const FINAL: MatchRow = {
  id: 'm2',
  category_id: 'k1',
  stage: 'knockout',
  group_id: null,
  round: 1,
  bracket_position: 1,
  entry_a_id: null,
  entry_b_id: null,
  source_a: { group: 'g1', place: 1 },
  source_b: { winner_of: 'm1' },
  court_id: 'court-1',
  starts_at: '2026-10-17T20:00:00+00:00',
  ends_at: '2026-10-17T21:30:00+00:00',
  pinned: true,
  status: 'scheduled',
  winner_entry_id: null,
  walkover_entry_id: null,
  sets: [],
}

describe('toFixture', () => {
  it('reads the groups and the matches the database returns, in order', () => {
    const fixture = toFixture(
      [
        {
          id: 'g1',
          category_id: 'k1',
          name: 'Zona A',
          sort_order: 0,
          members: [
            { entry_id: 'e2', draw_position: 2, place: null },
            { entry_id: 'e1', draw_position: 1, place: 1 },
          ],
        },
      ],
      [
        FINAL,
        {
          ...FINAL,
          id: 'm1',
          stage: 'group',
          group_id: 'g1',
          round: null,
          bracket_position: null,
          entry_a_id: 'e1',
          entry_b_id: 'e2',
          source_a: null,
          source_b: null,
          pinned: false,
          status: 'finished',
          winner_entry_id: 'e1',
          sets: [
            { set_number: 2, games_a: 6, games_b: 3, super_tiebreak: false },
            { set_number: 1, games_a: 6, games_b: 4, super_tiebreak: false },
          ],
        },
      ],
    )
    expect(fixture.groups[0].members).toEqual([
      { entryId: 'e1', drawPosition: 1, place: 1 },
      { entryId: 'e2', drawPosition: 2, place: null },
    ])
    expect(fixture.matches.map((match) => match.id)).toEqual(['m1', 'm2'])
    expect(fixture.matches[0].sets).toEqual([set(6, 4), set(6, 3)])
    expect(fixture.matches[1]).toMatchObject({
      sourceA: { kind: 'group', groupId: 'g1', place: 1 },
      sourceB: { kind: 'winner', matchId: 'm1' },
      startsAt: new Date('2026-10-17T20:00:00Z'),
      pinned: true,
    })
  })
})

describe('readSource', () => {
  it('reads a group place or a winner, and nothing else', () => {
    expect(readSource({ group: 'g1', place: 2 })).toEqual({ kind: 'group', groupId: 'g1', place: 2 })
    expect(readSource({ winner_of: 'm1' })).toEqual({ kind: 'winner', matchId: 'm1' })
    expect(readSource(null)).toBeNull()
    expect(readSource({ group: 'g1' })).toBeNull()
    expect(readSource('m1')).toBeNull()
  })
})

describe('names', () => {
  it('names the rounds and the knockout matches', () => {
    expect(roundName(2)).toBe('Semifinal')
    expect(roundName(16)).toBe('Ronda de 32')
    expect(knockoutLabel(1, 1)).toBe('Final')
    expect(knockoutLabel(4, 3)).toBe('Cuartos de final 3')
    expect(knockoutCode(1, 1)).toBe('Final')
    expect(knockoutCode(2, 1)).toBe('SF1')
    expect(knockoutCode(8, 2)).toBe('OF2')
  })

  it('names each side: the pair, or where it comes from', () => {
    const semifinal = makeMatch({ id: 's1', stage: 'knockout', groupId: null, round: 2, position: 1 })
    const final = makeMatch({
      id: 'f',
      stage: 'knockout',
      groupId: null,
      round: 1,
      position: 1,
      entryA: null,
      entryB: null,
      sourceA: { kind: 'group', groupId: 'g1', place: 1 },
      sourceB: { kind: 'winner', matchId: 's1' },
    })
    const fixture = { groups: [makeGroup({ members: members(['e1', 'e2']) })], matches: [makeMatch(), semifinal, final] }
    const name = (entryId: string) => (entryId === 'e1' ? 'Ana y Pedro' : 'Bruno y Lucía')
    expect(sideName(fixture, fixture.matches[0], 'a', name)).toBe('Ana y Pedro')
    expect(sideName(fixture, final, 'a', name)).toBe('1° Zona A')
    expect(sideName(fixture, final, 'b', name)).toBe('Ganador SF1')
    expect(matchName(fixture, fixture.matches[0])).toBe('Zona A')
    expect(matchName(fixture, semifinal)).toBe('Semifinal 1')
  })
})

describe('scores', () => {
  it('shows the sets, or W.O.', () => {
    expect(scoreText(makeMatch({ status: 'finished', sets: [set(6, 4), set(3, 6), set(10, 8, true)] }))).toBe('6-4 3-6 10-8')
    expect(scoreText(makeMatch({ status: 'walkover', sets: [set(6, 0), set(6, 0)] }))).toBe('W.O.')
    expect(scoreText(makeMatch())).toBeNull()
  })

  it('knows which matches are over', () => {
    expect(isDone(makeMatch({ status: 'finished' }))).toBe(true)
    expect(isDone(makeMatch({ status: 'walkover' }))).toBe(true)
    expect(isDone(makeMatch({ status: 'playing' }))).toBe(false)
  })
})


describe('the set being played', () => {
  it('reads in_progress; a set without it is closed', () => {
    const [match] = toFixture(
      [],
      [
        {
          ...FINAL,
          status: 'playing',
          sets: [
            { set_number: 1, games_a: 6, games_b: 4, super_tiebreak: false },
            { set_number: 2, games_a: 2, games_b: 1, super_tiebreak: false, in_progress: true },
          ],
        },
      ],
    ).matches
    expect(match.sets).toEqual([set(6, 4), set(2, 1, false, true)])
    expect(scoreText(match)).toBe('6-4 2-1')
  })
})

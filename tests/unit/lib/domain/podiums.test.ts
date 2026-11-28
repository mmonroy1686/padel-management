import { describe, expect, it } from 'vitest'
import { americanoPodium, categoryPlaces, championshipPodiums, medalCounts, sortPodiums } from '@/lib/domain/podiums'
import { ANA, BRUNO, LUCIA, makeCategory, makeChampionship, makeEntry, PEDRO, TIMEZONE } from '../../fixtures/championships'
import { makeGroup, makeMatch } from '../../fixtures/championship-fixture'
import { makeEntries, makeGame, makeTournament } from '../../fixtures/tournaments'

const knockout = (id: string, round: number, entryA: string | null, entryB: string | null, winner: string | null) =>
  makeMatch({ id, stage: 'knockout', groupId: null, round, entryA, entryB, winner, status: winner ? 'finished' : 'scheduled' })

describe('categoryPlaces', () => {
  it('the final gives the champion and the runner-up; the semifinals, third', () => {
    const fixture = {
      groups: [],
      matches: [knockout('s1', 2, 'e1', 'e2', 'e1'), knockout('s2', 2, 'e3', 'e4', 'e4'), knockout('f', 1, 'e1', 'e4', 'e4')],
    }
    expect(Object.fromEntries(categoryPlaces('k1', fixture))).toEqual({ e4: 1, e1: 2, e2: 3, e3: 3 })
  })

  it('nothing while the final is still to play', () => {
    const fixture = { groups: [], matches: [knockout('s1', 2, 'e1', 'e2', 'e1'), knockout('f', 1, 'e1', null, null)] }
    expect(categoryPlaces('k1', fixture).size).toBe(0)
  })

  it('a single group: its closed places', () => {
    const group = makeGroup({
      members: [
        { entryId: 'e1', drawPosition: 1, place: 2 },
        { entryId: 'e2', drawPosition: 2, place: 1 },
        { entryId: 'e3', drawPosition: 3, place: 4 },
      ],
    })
    expect(Object.fromEntries(categoryPlaces('k1', { groups: [group], matches: [] }))).toEqual({ e1: 2, e2: 1 })
  })
})

describe('championshipPodiums', () => {
  it('the player’s place, with category and partner, dated on the last day', () => {
    const championship = makeChampionship({
      name: 'Copa de Verano',
      categories: [
        makeCategory({
          name: '5ª',
          entries: [makeEntry({ id: 'e1', player1: ANA, player2: PEDRO }), makeEntry({ id: 'e2', player1: BRUNO, player2: LUCIA })],
        }),
      ],
    })
    const fixture = { groups: [], matches: [knockout('f', 1, 'e1', 'e2', 'e2')] }
    expect(championshipPodiums(championship, fixture, 'u-ana', TIMEZONE)).toEqual([
      expect.objectContaining({ place: 2, title: 'Copa de Verano', detail: '5ª · con Pedro', date: '2026-10-18' }),
    ])
    expect(championshipPodiums(championship, fixture, 'u-bruno', TIMEZONE)[0].place).toBe(1)
  })
})

describe('americanoPodium', () => {
  it('a finished americano: the place in the ranking, top three only', () => {
    const tournament = makeTournament({
      status: 'finished',
      entries: makeEntries(4),
      games: [makeGame('g1', ['e1', 'e2'], ['e3', 'e4'], 20), makeGame('g2', ['e1', 'e3'], ['e2', 'e4'], 15)],
    })
    expect(americanoPodium(tournament, 'p1', TIMEZONE)).toMatchObject({ place: 1, kind: 'americano' })
    expect(americanoPodium(tournament, 'p4', TIMEZONE)).toBeNull()
    expect(americanoPodium({ ...tournament, status: 'in_progress' }, 'p1', TIMEZONE)).toBeNull()
  })
})

describe('the showcase', () => {
  it('newest first, and the medals counted', () => {
    const base = { kind: 'championship' as const, title: 'x', detail: '', href: '/' }
    const podiums = sortPodiums([
      { ...base, key: 'a', place: 3, date: '2026-09-01' },
      { ...base, key: 'b', place: 1, date: '2026-11-01' },
    ])
    expect(podiums.map((podium) => podium.key)).toEqual(['b', 'a'])
    expect(medalCounts(podiums)).toEqual({ 1: 1, 2: 0, 3: 1 })
  })
})

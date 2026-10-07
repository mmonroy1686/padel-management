import { describe, expect, it } from 'vitest'
import type { Fixture } from '@/lib/domain/championship-fixture'
import { pairsCategories } from '@/lib/domain/championship-pairs'
import { pairCards, searchPairs } from '@/lib/domain/championship-search'
import { matchViews, zoneViews, type ViewContext } from '@/lib/domain/championship-views'
import { BRUNO, LUCIA, makeCategory, makeChampionship, makeEntry, player, TIMEZONE } from '../../fixtures/championships'
import { makeGroup, makeMatch, played, set } from '../../fixtures/championship-fixture'

const ANA = player('pl-ana', 'Ana Pérez', 'u-ana')
const PEDRO = player('pl-pedro', 'Pedro Viera')
// 6ta Libre: Ana Pérez and Pedro Viera, Bruno and Lucía, Gabi and Marta waiting. 5ta Mixto: Ana Pérez and Bruno.
const CHAMPIONSHIP = makeChampionship({
  status: 'in_progress',
  categories: [
    makeCategory({
      entries: [
        makeEntry({ id: 'e1', player1: ANA, player2: PEDRO }),
        makeEntry({ id: 'e2', player1: BRUNO, player2: LUCIA }),
        makeEntry({ id: 'e3', player1: player('pl-gabi', 'Gabi'), player2: player('pl-marta', 'Marta'), status: 'waiting' }),
      ],
    }),
    makeCategory({ id: 'k2', name: '5ta Mixto', entries: [makeEntry({ id: 'e4', categoryId: 'k2', player1: ANA, player2: BRUNO })] }),
  ],
})
const CTX: ViewContext = { timezone: TIMEZONE, today: '2026-10-17', courtName: new Map([['court-1', 'Cancha 1']]) }

// Zona A is closed (Ana and Pedro 1st); the semifinal SF1, Ana and Pedro against Bruno and Lucía, is at 14:00 on
// Cancha 1; SF2 is still to be defined; their winners meet in the final.
const ZONE = makeGroup({
  members: [
    { entryId: 'e1', drawPosition: 1, place: 1 },
    { entryId: 'e2', drawPosition: 2, place: 2 },
  ],
})
const SEMI = makeMatch({
  id: 's1',
  stage: 'knockout',
  groupId: null,
  round: 2,
  position: 1,
  courtId: 'court-1',
  startsAt: new Date('2026-10-17T17:00:00Z'),
  endsAt: new Date('2026-10-17T18:30:00Z'),
})
const SEMI2 = makeMatch({ id: 's2', stage: 'knockout', groupId: null, round: 2, position: 2, entryA: null, entryB: null })
const FINAL = makeMatch({
  id: 'f',
  stage: 'knockout',
  groupId: null,
  round: 1,
  position: 1,
  entryA: null,
  entryB: null,
  sourceA: { kind: 'winner', matchId: 's1' },
  sourceB: { kind: 'winner', matchId: 's2' },
})
const FIXTURE: Fixture = { groups: [ZONE], matches: [played('m1', 'e1', 'e2', 'a'), SEMI, SEMI2, FINAL] }

function cards(fixture: Fixture, phones?: Map<string, string>) {
  const views = matchViews(CHAMPIONSHIP, fixture, CTX)
  const input = { championship: CHAMPIONSHIP, fixture, views, zones: zoneViews(CHAMPIONSHIP, fixture) }
  return phones
    ? pairCards(input, pairsCategories(CHAMPIONSHIP, phones).flatMap((category) => category.rows))
    : pairCards(input)
}

function card(fixture: Fixture, entryId: string) {
  return cards(fixture).find((item) => item.entryId === entryId)
}

describe('searchPairs', () => {
  it('finds the pairs with every word typed, without accents, in each of their categories', () => {
    const all = cards(FIXTURE)
    expect(searchPairs(all, 'perez').map((item) => item.label)).toEqual([
      'Ana Pérez y Pedro Viera · 6ta Libre',
      'Ana Pérez y Bruno · 5ta Mixto',
    ])
    expect(searchPairs(all, 'ANA  vie').map((item) => item.entryId)).toEqual(['e1'])
    expect(searchPairs(all, 'pérez bruno').map((item) => item.entryId)).toEqual(['e4'])
    expect(searchPairs(all, '   ')).toEqual([])
  })
})

describe('pairCards', () => {
  it('says where a pair stands: its matches, its group and its next rival in the bracket', () => {
    const ana = card(FIXTURE, 'e1')
    expect(ana).toMatchObject({
      categoryName: '6ta Libre',
      pair: 'Ana Pérez y Pedro Viera',
      situation: 'En la llave · Semifinal 1',
      bracket: { match: 'Semifinal 1', rival: 'Bruno y Lucía', next: 'Si gana: Final contra Ganador SF2' },
      private: null,
    })
    expect(ana?.played.map((match) => match.id)).toEqual(['m1'])
    expect(ana?.upcoming.map((match) => `${match.id} ${match.time} ${match.court}`)).toEqual(['s1 14:00 Cancha 1'])
    expect(ana?.live).toEqual([])
    expect(ana?.zone?.name).toBe('Zona A')
  })

  it('follows a pair to the end: waiting, still in, out or champion', () => {
    const semiPlayed = { ...SEMI, status: 'finished' as const, winner: 'e1', sets: [set(6, 3), set(6, 3)] }
    const lost: Fixture = { ...FIXTURE, matches: [played('m1', 'e1', 'e2', 'a'), semiPlayed, SEMI2, FINAL] }
    expect(card(lost, 'e2')?.situation).toBe('Eliminada')
    const won: Fixture = {
      ...FIXTURE,
      matches: [
        played('m1', 'e1', 'e2', 'a'),
        semiPlayed,
        SEMI2,
        { ...FINAL, entryA: 'e1', entryB: 'e9', status: 'finished', winner: 'e1', sets: [set(6, 2), set(6, 2)] },
      ],
    }
    expect(card(won, 'e1')?.situation).toBe('Campeona')
    expect(card(FIXTURE, 'e3')?.situation).toBe('En espera, puesto 1')
    expect(card({ groups: [], matches: [] }, 'e4')?.situation).toBe('Con lugar')
    const open: Fixture = { groups: [makeGroup({ members: [{ entryId: 'e1', drawPosition: 1, place: null }] })], matches: [] }
    expect(card(open, 'e1')?.situation).toBe('En la Zona A')
  })

  it('adds the payment, the hours and the phones for the club only', () => {
    const club = cards(FIXTURE, new Map([['pl-pedro', '099111001']])).find((item) => item.entryId === 'e1')
    expect(club?.private).toEqual({
      phones: '099111001',
      paymentState: 'pending',
      charge: 2000,
      hoursText: 'Pueden jugar en cualquier horario.',
    })
    expect(cards(FIXTURE).every((item) => item.private === null)).toBe(true)
  })
})

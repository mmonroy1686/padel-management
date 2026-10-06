import { describe, expect, it } from 'vitest'
import {
  brackets,
  byDay,
  championshipShareText,
  dayBoard,
  finishable,
  matchViews,
  myMatchViews,
  seedPairs,
  zoneViews,
  type ViewContext,
} from '@/lib/domain/championship-views'
import { BRUNO, LUCIA, makeCategory, makeChampionship, makeEntry, TIMEZONE } from '../../fixtures/championships'
import { makeGroup, makeMatch, members, set } from '../../fixtures/championship-fixture'

// Saturday 17: Ana and Pedro beat Bruno and Lucía at 08:00 on Cancha 1; the final is at 11:00 on Cancha 2.
const CHAMPIONSHIP = makeChampionship({
  categories: [
    makeCategory({ entries: [makeEntry({ id: 'e1' }), makeEntry({ id: 'e2', player1: BRUNO, player2: LUCIA })] }),
  ],
})
const PLAYED = makeMatch({
  courtId: 'court-1',
  startsAt: new Date('2026-10-17T11:00:00Z'),
  endsAt: new Date('2026-10-17T12:30:00Z'),
  status: 'finished',
  winner: 'e1',
  sets: [set(6, 3), set(6, 3)],
})
const FINAL = makeMatch({
  id: 'f',
  stage: 'knockout',
  groupId: null,
  round: 1,
  position: 1,
  entryA: null,
  entryB: null,
  sourceA: { kind: 'group', groupId: 'g1', place: 1 },
  sourceB: { kind: 'group', groupId: 'g1', place: 2 },
  courtId: 'court-2',
  startsAt: new Date('2026-10-17T14:00:00Z'),
  endsAt: new Date('2026-10-17T15:30:00Z'),
})
const FIXTURE = { groups: [makeGroup({ members: members(['e1', 'e2']) })], matches: [FINAL, PLAYED] }
const CTX: ViewContext = {
  timezone: TIMEZONE,
  today: '2026-10-17',
  courtName: new Map([
    ['court-1', 'Cancha 1'],
    ['court-2', 'Cancha 2'],
  ]),
}

describe('matchViews', () => {
  it('names every match and side, with its day, time, court, state and score, in order', () => {
    const [played, final] = matchViews(CHAMPIONSHIP, FIXTURE, CTX)
    expect(played).toMatchObject({
      id: 'm1',
      categoryName: '6ta Libre',
      name: 'Zona A',
      sideA: 'Ana y Pedro',
      sideB: 'Bruno y Lucía',
      day: 'Hoy',
      time: '08:00',
      court: 'Cancha 1',
      statusLabel: 'Terminado',
      score: '6-3 6-3',
      winner: 'a',
      ready: true,
    })
    expect(final).toMatchObject({
      name: 'Final',
      sideA: '1° Zona A',
      sideB: '2° Zona A',
      time: '11:00',
      court: 'Cancha 2',
      score: null,
      winner: null,
      ready: false,
    })
  })

  it('splits the tournament day and the days of play', () => {
    const views = matchViews(CHAMPIONSHIP, FIXTURE, CTX)
    const board = dayBoard(views)
    expect(board.playing).toEqual([])
    expect(board.upcoming.map((view) => view.id)).toEqual(['f'])
    expect(board.finished.map((view) => view.id)).toEqual(['m1'])
    expect(byDay(views)).toEqual([{ key: '2026-10-17', label: 'Sábado 17 de octubre', matches: views }])
  })
})

describe('zones and brackets', () => {
  it('shows each group with its table, and asks to close it when it is complete', () => {
    expect(zoneViews(CHAMPIONSHIP, FIXTURE)).toEqual([
      {
        id: 'g1',
        categoryId: 'k1',
        categoryName: '6ta Libre',
        name: 'Zona A',
        complete: true,
        closed: false,
        needsOrder: true,
        tiedNames: [],
        rows: [
          { entryId: 'e1', name: 'Ana y Pedro', played: 1, won: 1, lost: 0, sets: '2-0', games: '12-6' },
          { entryId: 'e2', name: 'Bruno y Lucía', played: 1, won: 0, lost: 1, sets: '0-2', games: '6-12' },
        ],
      },
    ])
  })

  it('names a tie only once the group is complete: a match still to play may break it', () => {
    const PENDING = makeMatch({ id: 'p', status: 'scheduled', winner: null, sets: [] })
    const [zone] = zoneViews(CHAMPIONSHIP, { groups: FIXTURE.groups, matches: [FINAL, PENDING] })
    expect(zone).toMatchObject({ complete: false, tiedNames: [] })
  })

  it('shows each category\'s bracket by rounds', () => {
    const views = matchViews(CHAMPIONSHIP, FIXTURE, CTX)
    expect(brackets(CHAMPIONSHIP, views)).toEqual([
      { categoryId: 'k1', categoryName: '6ta Libre', rounds: [{ round: 1, name: 'Final', matches: [views[1]] }] },
    ])
  })

  it('finishes when every match is played and every group closed', () => {
    expect(finishable(FIXTURE)).toBe(false)
    const closed = makeGroup({ members: [{ entryId: 'e1', drawPosition: 1, place: 1 }, { entryId: 'e2', drawPosition: 2, place: 2 }] })
    expect(finishable({ groups: [closed], matches: [PLAYED, { ...FINAL, status: 'finished', winner: 'e1', entryA: 'e1', entryB: 'e2' }] })).toBe(true)
  })
})

describe('for the players', () => {
  it('lists the viewer\'s matches with the rival', () => {
    const mine = myMatchViews(CHAMPIONSHIP, matchViews(CHAMPIONSHIP, FIXTURE, CTX), 'u-ana')
    expect(mine.map((view) => [view.id, view.rival])).toEqual([['m1', 'Bruno y Lucía']])
    expect(myMatchViews(CHAMPIONSHIP, matchViews(CHAMPIONSHIP, FIXTURE, CTX), 'u-nadie')).toEqual([])
  })

  it('words the message to share', () => {
    expect(championshipShareText('Campeonato de Primavera', 'https://rustic.uy/c/primavera-7k2f')).toBe(
      'Seguí el Campeonato de Primavera en vivo: https://rustic.uy/c/primavera-7k2f',
    )
  })
})

describe('seedPairs', () => {
  it('lists the pairs with a place, strongest first, with what they declared', () => {
    const category = makeCategory({
      entries: [
        makeEntry({ id: 'e1' }),
        makeEntry({ id: 'e2', player1: BRUNO, player2: LUCIA, level1: 4, level2: 4, seed: 1 }),
        makeEntry({ id: 'e3', status: 'waiting' }),
      ],
    })
    expect(seedPairs(category)).toEqual([
      { id: 'e2', name: 'Bruno y Lucía', levels: 'Declaran 4ª y 4ª (suma 8)', seed: 1 },
      { id: 'e1', name: 'Ana y Pedro', levels: 'Declaran 5ª y 6ª (suma 11)', seed: null },
    ])
  })
})

import { describe, expect, it } from 'vitest'
import {
  categoryDetail,
  championshipPeopleText,
  matchRulesText,
  readMatchRules,
  championshipBlocks,
  championshipReadiness,
  closesText,
  datesText,
  entryStateText,
  maxUnavailable,
  myEntries,
  normalizePhone,
  pairName,
  partnerOf,
  registerStatus,
  smallCategories,
  spotsText,
  toChampionship,
  unavailabilityText,
  waitingPosition,
  windowText,
  type ChampionshipRow,
  smallCategoryText,
  upcomingChampionships,
} from '@/lib/domain/championships'
import { ANA, BRUNO, LUCIA, makeCategory, makeChampionship, makeEntry, NOW, PEDRO, TIMEZONE } from '../../fixtures/championships'

const ROW: ChampionshipRow = {
  id: 'ch1',
  name: 'Campeonato de Primavera',
  rules: '',
  poster_path: null,
  status: 'registration',
  registration_opens_at: '2026-10-06T12:00:00+00:00',
  registration_closes_at: '2026-10-16T11:00:00+00:00',
  max_categories_per_player: 2,
  windows: [
    { id: 'w2', on_date: '2026-10-18', from_time: '14:00:00', to_time: '20:00:00', court_ids: ['court-1'] },
    { id: 'w1', on_date: '2026-10-17', from_time: '08:00:00', to_time: '14:00:00', court_ids: ['court-1', 'court-2'] },
  ],
  categories: [
    {
      id: 'k2', name: '5ta Damas', gender: 'women', level_min: 5, level_max: 5, min_pairs: 4, max_pairs: 8, price: 1800,
      format: 'round_robin', group_size: 3, qualifiers_per_group: 1, match_minutes: 60, seeding: 'manual',
      match_rules: { third_set: 'full', golden_point: true }, status: 'open', merged_into: null, sort_order: 1, entries: [],
    },
    {
      id: 'k1', name: '6ta Libre', gender: 'open', level_min: null, level_max: null, min_pairs: 2, max_pairs: 4, price: 2000,
      format: 'groups_knockout', group_size: 4, qualifiers_per_group: 2, match_minutes: 90, seeding: 'ranking',
      match_rules: {}, status: 'open', merged_into: null, sort_order: 0,
      entries: [
        {
          id: 'e2', player1_level: 5, player2_level: 5, status: 'waiting',
          unavailability_approved: false, created_at: '2026-10-07T12:00:00+00:00',
          player1: { id: 'pl-bruno', name: 'Bruno', profile_id: 'u-bruno' }, player2: null, payments: [], unavailability: [],
        },
        {
          id: 'e1', player1_level: 5, player2_level: 6, status: 'active',
          unavailability_approved: false, created_at: '2026-10-06T12:00:00+00:00',
          player1: { id: 'pl-ana', name: 'Ana', profile_id: 'u-ana' }, player2: { id: 'pl-pedro', name: 'Pedro', profile_id: null },
          payments: [{ status: 'confirmed', amount: 2000, rejection_reason: null, created_at: '2026-10-08T12:00:00+00:00' }],
          unavailability: [{ on_date: '2026-10-17', from_time: '08:00:00' }],
        },
      ],
    },
  ],
}

describe('toChampionship', () => {
  it('reads what the database returns, in order', () => {
    const championship = toChampionship(ROW, TIMEZONE, new Map([['e1', { note: 'Prefieren de tarde', unavailability_note: 'Trabajo' }]]))
    expect(championship.windows.map((window) => window.id)).toEqual(['w1', 'w2'])
    expect(championship.windows[0]).toEqual({ id: 'w1', date: '2026-10-17', fromTime: '08:00', toTime: '14:00', courtIds: ['court-1', 'court-2'] })
    expect(championship.startsAt).toEqual(new Date('2026-10-17T11:00:00Z'))
    expect(championship.endsAt).toEqual(new Date('2026-10-18T23:00:00Z'))
    expect(championship.registrationClosesAt).toEqual(new Date('2026-10-16T11:00:00Z'))
    expect(championship.categories.map((category) => category.name)).toEqual(['6ta Libre', '5ta Damas'])
    const [libre, damas] = championship.categories
    expect(libre.entries.map((entry) => entry.id)).toEqual(['e1', 'e2'])
    expect(libre.entries[0]).toMatchObject({ level1: 5, level2: 6, note: 'Prefieren de tarde', unavailable: ['2026-10-17@08:00'] })
    expect(libre.entries[1].player2).toEqual({ id: '', name: 'Jugador', profileId: null })
    expect(libre).toMatchObject({ thirdSet: 'super_tiebreak', goldenPoint: false, qualifiers: 2 })
    expect(damas).toMatchObject({ thirdSet: 'full', goldenPoint: true, levelMin: 5, levelMax: 5 })
  })
})

describe('places and the waiting line', () => {
  const category = makeCategory({
    maxPairs: 2,
    entries: [
      makeEntry({ id: 'e1' }),
      makeEntry({ id: 'e2', player1: BRUNO, player2: LUCIA }),
      makeEntry({ id: 'e3', status: 'waiting', player1: { id: 'pl-x', name: 'Xavi', profileId: null } }),
      makeEntry({ id: 'e4', status: 'withdrawn' }),
    ],
  })

  it('counts the places and who waits', () => {
    expect(spotsText(category)).toBe('2 de 2 parejas · 1 en espera')
    expect(spotsText(makeCategory())).toBe('0 de 4 parejas')
  })

  it('tells each pair where it stands', () => {
    expect(waitingPosition(category, 'e3')).toBe(1)
    expect(waitingPosition(category, 'e1')).toBeNull()
    expect(entryStateText(category, category.entries[0])).toBe('Con lugar')
    expect(entryStateText(category, category.entries[2])).toBe('En espera, puesto 1')
  })

  it('names a pair and the partner of whoever looks', () => {
    expect(pairName(makeEntry())).toBe('Ana y Pedro')
    expect(partnerOf(makeEntry(), 'u-ana')).toEqual(PEDRO)
    expect(partnerOf(makeEntry({ player1: PEDRO, player2: ANA }), 'u-ana')).toEqual(PEDRO)
  })
})

describe('myEntries and registerStatus', () => {
  const libre = makeCategory({ id: 'k1', entries: [makeEntry({ id: 'e1' })] })
  const damas = makeCategory({ id: 'k2', name: '5ta Damas', entries: [makeEntry({ id: 'e5', categoryId: 'k2', status: 'withdrawn' })] })
  const full = makeCategory({ id: 'k3', name: '4ta', maxPairs: 2, entries: [makeEntry({ id: 'e6', player1: BRUNO }), makeEntry({ id: 'e7', player1: BRUNO })] })
  const championship = makeChampionship({ categories: [libre, damas, full] })

  it('finds the pairs of whoever looks that are still in', () => {
    expect(myEntries(championship, 'u-ana').map(({ entry, category }) => [entry.id, category.id])).toEqual([['e1', 'k1']])
    expect(myEntries(championship, 'u-nadie')).toEqual([])
  })

  it('lets a player sign up while registration is open, and says why not', () => {
    expect(registerStatus(championship, damas, 'u-ana', NOW)).toEqual({ ok: true, full: false })
    expect(registerStatus(championship, full, 'u-ana', NOW)).toEqual({ ok: true, full: true })
    expect(registerStatus(championship, libre, 'u-ana', NOW)).toEqual({ ok: false, reason: 'Ya estás anotado en esta categoría.' })
    expect(registerStatus({ ...championship, maxCategoriesPerPlayer: 1 }, damas, 'u-ana', NOW)).toEqual({
      ok: false,
      reason: 'Ya estás en 1 categoría, el máximo de este campeonato.',
    })
    expect(registerStatus(championship, damas, 'u-ana', new Date('2026-10-16T11:00:00Z'))).toEqual({
      ok: false,
      reason: 'La inscripción está cerrada.',
    })
    expect(registerStatus(championship, makeCategory({ status: 'cancelled' }), 'u-ana', NOW)).toEqual({
      ok: false,
      reason: 'Esta categoría ya no recibe parejas.',
    })
  })

  it('marks the categories with fewer pairs than they need', () => {
    expect(smallCategories(championship).map((category) => category.id)).toEqual(['k1', 'k2'])
  })
})

describe('blocks of 2 hours', () => {
  it('cuts each day of play from its start; the last block ends with the day', () => {
    const blocks = championshipBlocks([
      { id: 'w1', date: '2026-10-17', fromTime: '08:00', toTime: '13:00', courtIds: ['court-1'] },
      { id: 'w2', date: '2026-10-18', fromTime: '14:00', toTime: '18:00', courtIds: ['court-1'] },
    ])
    expect(blocks).toEqual([
      { key: '2026-10-17@08:00', date: '2026-10-17', fromTime: '08:00', toTime: '10:00' },
      { key: '2026-10-17@10:00', date: '2026-10-17', fromTime: '10:00', toTime: '12:00' },
      { key: '2026-10-17@12:00', date: '2026-10-17', fromTime: '12:00', toTime: '13:00' },
      { key: '2026-10-18@14:00', date: '2026-10-18', fromTime: '14:00', toTime: '16:00' },
      { key: '2026-10-18@16:00', date: '2026-10-18', fromTime: '16:00', toTime: '18:00' },
    ])
  })

  it('lets a pair mark up to 40 % by itself', () => {
    expect(maxUnavailable(6)).toBe(2)
    expect(maxUnavailable(5)).toBe(2)
    expect(maxUnavailable(10)).toBe(4)
    expect(maxUnavailable(2)).toBe(0)
  })

  it('says how many blocks a pair cannot play', () => {
    expect(unavailabilityText(0)).toBe('Pueden jugar en cualquier horario.')
    expect(unavailabilityText(1)).toBe('No pueden en 1 franja.')
    expect(unavailabilityText(3)).toBe('No pueden en 3 franjas.')
  })
})

describe('normalizePhone', () => {
  it('keeps the digits, and the local number of a Uruguayan one', () => {
    expect(normalizePhone('099 123 456')).toBe('099123456')
    expect(normalizePhone('+598 99 123 456')).toBe('099123456')
    expect(normalizePhone('00598 99 123 456')).toBe('099123456')
    expect(normalizePhone('99 123 456')).toBe('099123456')
    expect(normalizePhone('+54 9 11 5555 6666')).toBe('5491155556666')
    expect(normalizePhone('123')).toBeNull()
    expect(normalizePhone('')).toBeNull()
  })
})

describe('texts', () => {
  it('says when it is played and until when one signs up', () => {
    expect(datesText(makeChampionship())).toBe('Del sábado 17 de octubre al domingo 18 de octubre')
    expect(datesText(makeChampionship({ windows: [makeChampionship().windows[0]] }))).toBe('sábado 17 de octubre')
    expect(datesText(makeChampionship({ windows: [] }))).toBe('Sin días de juego todavía')
    expect(windowText(makeChampionship().windows[0])).toBe('sábado 17 de octubre, 08:00 a 14:00')
    expect(closesText(makeChampionship(), TIMEZONE)).toBe('viernes 16 de octubre, 08:00')
    expect(closesText(makeChampionship({ registrationClosesAt: null }), TIMEZONE)).toBeNull()
  })

  it('describes a category', () => {
    expect(categoryDetail(makeCategory())).toBe('Libre · $2.000 por pareja')
    expect(categoryDetail(makeCategory({ gender: 'women', levelMin: 5, levelMax: 6, price: 0 }))).toBe('Damas · 5ª a 6ª · Sin costo')
  })

  it('says what a draft still needs to open', () => {
    expect(championshipReadiness(makeChampionship())).toBeNull()
    expect(championshipReadiness(makeChampionship({ windows: [] }))).toBe('Agregá al menos un día de juego.')
    expect(championshipReadiness(makeChampionship({ categories: [] }))).toBe('Agregá al menos una categoría.')
  })
})

describe('upcomingChampionships', () => {
  it('lists the ones members can sign up to or that are still to be played, first to start first', () => {
    const later = makeChampionship({ id: 'later', startsAt: new Date('2026-11-01T11:00:00Z'), endsAt: new Date('2026-11-01T23:00:00Z') })
    const sooner = makeChampionship({ id: 'sooner' })
    const over = makeChampionship({ id: 'over', status: 'closed', startsAt: new Date('2026-10-01T11:00:00Z'), endsAt: new Date('2026-10-02T23:00:00Z') })
    const cancelled = makeChampionship({ id: 'cancelled', status: 'cancelled' })
    const draft = makeChampionship({ id: 'draft', status: 'draft' })
    expect(upcomingChampionships([later, over, cancelled, sooner, draft], NOW).map((championship) => championship.id)).toEqual(['sooner', 'later'])
  })
})

describe('smallCategoryText', () => {
  it('says how many pairs a category has of the ones it needs', () => {
    expect(smallCategoryText(makeCategory({ minPairs: 4, entries: [makeEntry()] }))).toBe('1 pareja de 4 mínimas')
    expect(smallCategoryText(makeCategory({ minPairs: 4 }))).toBe('0 parejas de 4 mínimas')
  })
})

describe('match rules', () => {
  it('reads the time limit; none means best of 3 sets as long as it takes', () => {
    expect(readMatchRules({ third_set: 'full', golden_point: true, time_limit_minutes: 50 })).toEqual({
      thirdSet: 'full',
      goldenPoint: true,
      timeLimit: 50,
    })
    expect(readMatchRules({})).toEqual({ thirdSet: 'super_tiebreak', goldenPoint: false, timeLimit: null })
  })

  it('says how a match is played', () => {
    expect(matchRulesText(makeCategory())).toBe('Al mejor de 3 sets, sin límite de tiempo · Tercer set: súper tie-break a 10')
    expect(matchRulesText(makeCategory({ timeLimit: 50, thirdSet: 'full', goldenPoint: true }))).toBe(
      'Al mejor de 3 sets, con 50 minutos de juego · Tercer set: set completo · Punto de oro',
    )
  })
})

describe('championshipPeopleText', () => {
  it('counts the pairs with a place and the ones waiting, over every open category', () => {
    const libre = makeCategory({ id: 'k1', entries: [makeEntry({ id: 'e1' }), makeEntry({ id: 'e2', status: 'waiting' })] })
    const damas = makeCategory({ id: 'k2', entries: [makeEntry({ id: 'e3' }), makeEntry({ id: 'e4', status: 'withdrawn' })] })
    expect(championshipPeopleText(makeChampionship({ categories: [libre, damas] }))).toBe('2 parejas · 1 en espera')
    expect(championshipPeopleText(makeChampionship({ categories: [makeCategory({ entries: [makeEntry()] })] }))).toBe('1 pareja')
  })
})


describe('the draw and the public link', () => {
  it('reads each pair\'s seed and the public code', () => {
    const championship = toChampionship(
      {
        ...ROW,
        public_code: 'primavera-7k2f',
        categories: ROW.categories.map((category) => ({
          ...category,
          entries: category.entries.map((entry) => ({ ...entry, seed: entry.id === 'e1' ? 1 : null })),
        })),
      },
      TIMEZONE,
    )
    expect(championship.publicCode).toBe('primavera-7k2f')
    expect(championship.categories[0].entries.map((entry) => entry.seed)).toEqual([1, null])
  })

  it('has none when the database did not send them', () => {
    const championship = toChampionship(ROW, TIMEZONE)
    expect(championship.publicCode).toBeNull()
    expect(championship.categories[0].entries[0].seed).toBeNull()
  })
})

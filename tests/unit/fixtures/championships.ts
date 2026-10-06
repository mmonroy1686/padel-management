import type { Championship, ChampionshipCategory, ChampionshipEntry, ChampionshipPlayer } from '@/lib/domain/championships'

export const TIMEZONE = 'America/Montevideo'
// Saturday 10 of October 2026, 09:00 in Montevideo: registration is open.
export const NOW = new Date('2026-10-10T12:00:00Z')

export function player(id: string, name: string, profileId: string | null = null): ChampionshipPlayer {
  return { id, name, profileId }
}
export const ANA = player('pl-ana', 'Ana', 'u-ana')
export const BRUNO = player('pl-bruno', 'Bruno', 'u-bruno')
export const PEDRO = player('pl-pedro', 'Pedro')
export const LUCIA = player('pl-lucia', 'Lucía')

// Ana and Pedro (from outside), with a place, nothing paid.
export function makeEntry(overrides: Partial<ChampionshipEntry> = {}): ChampionshipEntry {
  return {
    id: 'e1',
    categoryId: 'k1',
    player1: ANA,
    player2: PEDRO,
    level1: 5,
    level2: 6,
    status: 'active',
    seed: null,
    note: null,
    unavailabilityNote: null,
    unavailabilityApproved: false,
    createdAt: new Date('2026-10-06T12:00:00Z'),
    payments: [],
    unavailable: [],
    ...overrides,
  }
}

// '6ta Libre': 2 to 4 pairs, $2.000 a pair, nobody in yet.
export function makeCategory(overrides: Partial<ChampionshipCategory> = {}): ChampionshipCategory {
  return {
    id: 'k1',
    name: '6ta Libre',
    gender: 'open',
    levelMin: null,
    levelMax: null,
    minPairs: 2,
    maxPairs: 4,
    price: 2000,
    format: 'groups_knockout',
    groupSize: 4,
    qualifiers: 2,
    matchMinutes: 90,
    seeding: 'ranking',
    thirdSet: 'super_tiebreak',
    goldenPoint: false,
    timeLimit: null,
    status: 'open',
    mergedInto: null,
    entries: [],
    ...overrides,
  }
}

// Saturday 17 (08:00 to 14:00, two courts) and Sunday 18 of October (14:00 to 20:00, one court); registration
// open until Friday 16 at 08:00 (11:00 UTC), 2 categories per player.
export function makeChampionship(overrides: Partial<Championship> = {}): Championship {
  return {
    id: 'ch1',
    name: 'Campeonato de Primavera',
    rules: 'Al mejor de 3 sets.',
    posterPath: null,
    publicCode: null,
    status: 'registration',
    registrationOpensAt: new Date('2026-10-06T12:00:00Z'),
    registrationClosesAt: new Date('2026-10-16T11:00:00Z'),
    maxCategoriesPerPlayer: 2,
    windows: [
      { id: 'w1', date: '2026-10-17', fromTime: '08:00', toTime: '14:00', courtIds: ['court-1', 'court-2'] },
      { id: 'w2', date: '2026-10-18', fromTime: '14:00', toTime: '20:00', courtIds: ['court-1'] },
    ],
    categories: [makeCategory()],
    startsAt: new Date('2026-10-17T11:00:00Z'),
    endsAt: new Date('2026-10-18T23:00:00Z'),
    ...overrides,
  }
}

import type { MatchView, ZoneView } from '@/lib/domain/championship-views'

// Zona A of '6ta Libre': Ana and Pedro against Bruno and Lucía, today at 08:00 on Cancha 1, not started.
export function makeView(overrides: Partial<MatchView> = {}): MatchView {
  return {
    id: 'm1',
    categoryId: 'k1',
    categoryName: '6ta Libre',
    name: 'Zona A',
    stage: 'group',
    groupId: 'g1',
    round: null,
    position: null,
    sideA: 'Ana y Pedro',
    sideB: 'Bruno y Lucía',
    entryA: 'e1',
    entryB: 'e2',
    startsAt: new Date('2026-10-17T11:00:00Z'),
    date: '2026-10-17',
    day: 'Hoy',
    time: '08:00',
    court: 'Cancha 1',
    status: 'scheduled',
    statusLabel: 'Programado',
    score: null,
    winner: null,
    sets: [],
    pinned: false,
    ready: true,
    ...overrides,
  }
}

// Zona A, complete and not closed yet: Ana and Pedro first.
export function makeZone(overrides: Partial<ZoneView> = {}): ZoneView {
  return {
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
    ...overrides,
  }
}

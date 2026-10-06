import { describe, expect, it } from 'vitest'
import {
  championshipRefunds,
  overviewStartsAt,
  unpaidChampionshipEntries,
  type OverviewChampionship,
  type OverviewChampionshipEntry,
} from '@/lib/domain/championship-payments'

const TIMEZONE = 'America/Montevideo'

function entry(overrides: Partial<OverviewChampionshipEntry> = {}): OverviewChampionshipEntry {
  return { id: 'e1', status: 'active', player1: { name: 'Ana' }, player2: { name: 'Pedro' }, payments: [], ...overrides }
}

// Started on Saturday 3 of October 2026 at 08:00 (11:00 UTC); '6ta Libre' at $2.000 a pair.
function championship(entries: OverviewChampionshipEntry[], overrides: Partial<OverviewChampionship> = {}): OverviewChampionship {
  return {
    id: 'ch1',
    name: 'Primavera',
    status: 'closed',
    windows: [
      { on_date: '2026-10-04', from_time: '14:00:00' },
      { on_date: '2026-10-03', from_time: '08:00:00' },
    ],
    categories: [{ id: 'k1', name: '6ta Libre', price: 2000, status: 'open', entries }],
    ...overrides,
  }
}

describe('overviewStartsAt', () => {
  it('is the start of the first day of play', () => {
    expect(overviewStartsAt(championship([]), TIMEZONE)).toEqual(new Date('2026-10-03T11:00:00Z'))
    expect(overviewStartsAt(championship([], { windows: [] }), TIMEZONE)).toBeNull()
  })
})

describe('unpaidChampionshipEntries', () => {
  const NOW = new Date('2026-10-05T12:00:00Z')

  it('lists pairs with a place that still owe, once the championship started', () => {
    const rows = [
      championship([
        entry({ id: 'owes', payments: [{ id: 'p1', status: 'confirmed', amount: 500 }] }),
        entry({ id: 'paid', payments: [{ id: 'p2', status: 'confirmed', amount: 2000 }] }),
        entry({ id: 'reported', payments: [{ id: 'p3', status: 'reported', amount: 2000 }] }),
        entry({ id: 'waiting', status: 'waiting' }),
      ]),
    ]
    expect(unpaidChampionshipEntries(rows, NOW, TIMEZONE)).toEqual([
      { entryId: 'owes', holder: 'Ana y Pedro', startsAt: new Date('2026-10-03T11:00:00Z'), what: 'Campeonato Primavera · 6ta Libre', due: 1500 },
    ])
  })

  it('leaves out championships to come or cancelled', () => {
    expect(unpaidChampionshipEntries([championship([entry()])], new Date('2026-10-01T12:00:00Z'), TIMEZONE)).toEqual([])
    expect(unpaidChampionshipEntries([championship([entry()], { status: 'cancelled' })], NOW, TIMEZONE)).toEqual([])
  })
})

describe('championshipRefunds', () => {
  it('lists confirmed payments of pairs that left, and of a cancelled championship', () => {
    const paid = [{ id: 'p1', status: 'confirmed' as const, amount: 2000 }]
    const rows = [
      championship([
        entry({ id: 'left', status: 'withdrawn', payments: paid }),
        entry({ id: 'out', status: 'removed', payments: [{ id: 'p2', status: 'refunded', amount: 2000 }] }),
        entry({ id: 'in', payments: [{ id: 'p3', status: 'confirmed', amount: 2000 }] }),
      ]),
      championship([entry({ id: 'cancelled', payments: [{ id: 'p4', status: 'confirmed', amount: 2000 }] })], { id: 'ch2', name: 'Invierno', status: 'cancelled' }),
    ]
    expect(championshipRefunds(rows, TIMEZONE)).toEqual([
      { paymentId: 'p1', holder: 'Ana y Pedro', startsAt: new Date('2026-10-03T11:00:00Z'), courtName: 'Campeonato Primavera · 6ta Libre', amount: 2000 },
      { paymentId: 'p4', holder: 'Ana y Pedro', startsAt: new Date('2026-10-03T11:00:00Z'), courtName: 'Campeonato Invierno · 6ta Libre', amount: 2000 },
    ])
  })
})

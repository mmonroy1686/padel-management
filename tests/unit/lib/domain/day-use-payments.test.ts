import { describe, expect, it } from 'vitest'
import { collectedToday, passRefunds, passStartsAt, unpaidPasses, type OverviewPass } from '@/lib/domain/day-use-payments'
import { at, DATE, TIMEZONE } from '../../fixtures/grid'
import { makePass } from '../../fixtures/day-use'

const pass = (overrides: Partial<OverviewPass>): OverviewPass => ({
  id: 'x',
  on_date: DATE,
  price: 450,
  discount_percent: 0,
  total: 450,
  status: 'bought',
  guest_name: null,
  player: { display_name: 'Ana' },
  product: { name: 'Day use completo', from_time: '08:00:00' },
  payments: [],
  ...overrides,
})

const PASSES: OverviewPass[] = [
  pass({ id: 'p1', on_date: '2026-09-30', status: 'inside' }),
  pass({ id: 'p2', guest_name: 'Pepe', player: null, payments: [{ id: 'pay2', status: 'confirmed', amount: 450 }] }),
  pass({ id: 'p3', on_date: '2026-10-02', player: { display_name: 'Bruno' } }),
  pass({ id: 'p4', discount_percent: 100, total: 0 }),
  pass({ id: 'p5', on_date: '2026-09-28', status: 'cancelled', player: { display_name: 'Carla' }, payments: [{ id: 'pay5', status: 'confirmed', amount: 450 }] }),
  pass({ id: 'p6', player: { display_name: 'Dani' }, payments: [{ id: 'pay6', status: 'reported', amount: 450 }] }),
  pass({ id: 'p7', player: { display_name: 'Eva' }, product: { name: 'Day use tarde', from_time: '18:00:00' } }),
]

describe('day use in Cobros', () => {
  it('starts each pass at its hours on the club clock', () => {
    expect(passStartsAt('2026-09-30', '08:00:00', TIMEZONE)).toEqual(at('08:00', '2026-09-30'))
  })

  it('lists passes that already started and still owe, without a transfer waiting', () => {
    expect(unpaidPasses(PASSES, at('10:00', DATE), TIMEZONE)).toEqual([
      { passId: 'p1', holder: 'Ana', startsAt: at('08:00', '2026-09-30'), productName: 'Day use completo', due: 450 },
    ])
  })

  it('lists what was paid for a pass that was cancelled', () => {
    expect(passRefunds(PASSES, TIMEZONE)).toEqual([
      { paymentId: 'pay5', holder: 'Carla', startsAt: at('08:00', '2026-09-28'), courtName: 'Day use completo', amount: 450 },
    ])
  })

  it('adds what was collected for the passes of the day', () => {
    expect(
      collectedToday([
        makePass({ payments: [{ status: 'confirmed', amount: 450, rejection_reason: null, created_at: '2026-10-01T12:00:00Z' }] }),
        makePass({ payments: [{ status: 'reported', amount: 450, rejection_reason: null, created_at: '2026-10-01T12:00:00Z' }] }),
        makePass({ payments: [{ status: 'confirmed', amount: 225, rejection_reason: null, created_at: '2026-10-01T12:00:00Z' }] }),
      ]),
    ).toBe(675)
  })
})

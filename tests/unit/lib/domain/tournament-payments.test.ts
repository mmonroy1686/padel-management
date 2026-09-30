import { describe, expect, it } from 'vitest'
import { entryPaymentView, entryRefunds, unpaidEntries, type OverviewEntry, type OverviewTournament } from '@/lib/domain/tournament-payments'

const pay = (status: 'reported' | 'confirmed' | 'rejected' | 'refunded', created_at = '2026-09-30T12:00:00Z', rejection_reason: string | null = null) => ({
  status,
  amount: 400,
  rejection_reason,
  created_at,
})

describe('entryPaymentView', () => {
  it('owes the price until a payment is confirmed', () => {
    expect(entryPaymentView(400, [], true)).toEqual({ state: 'pending', due: 400, canReportTransfer: true, rejectionReason: null })
    expect(entryPaymentView(400, [pay('reported')], true)).toMatchObject({ state: 'reported', due: 400, canReportTransfer: false })
    expect(entryPaymentView(400, [pay('confirmed')], true)).toMatchObject({ state: 'paid', due: 0, canReportTransfer: false })
    expect(entryPaymentView(0, [], true)).toMatchObject({ state: 'paid', due: 0 })
  })

  it('shows why the club rejected the last transfer, and hides the button if the club takes no transfers', () => {
    expect(entryPaymentView(400, [pay('rejected', '2026-09-30T12:00:00Z', 'No llegó')], true).rejectionReason).toBe('No llegó')
    expect(entryPaymentView(400, [], false).canReportTransfer).toBe(false)
  })
})

describe('Cobros for tournaments', () => {
  const NOW = new Date('2026-10-02T12:00:00Z')
  const tournaments: OverviewTournament[] = [
    { id: 't1', name: 'Americano', starts_at: '2026-10-01T21:00:00+00:00', price: 400, status: 'finished' },
    { id: 't2', name: 'Suspendido', starts_at: '2026-10-01T21:00:00+00:00', price: 400, status: 'cancelled' },
    { id: 't3', name: 'Próximo', starts_at: '2026-10-05T21:00:00+00:00', price: 400, status: 'registration' },
  ]
  const entry = (overrides: Partial<OverviewEntry>): OverviewEntry => ({
    id: 'e',
    tournament_id: 't1',
    guest_name: null,
    removed_at: null,
    player: { display_name: 'Ana' },
    payments: [],
    ...overrides,
  })
  const entries: OverviewEntry[] = [
    entry({ id: 'e1' }),
    entry({ id: 'e2', guest_name: 'Pepe', player: null, payments: [{ id: 'p2', status: 'confirmed', amount: 400 }] }),
    entry({ id: 'e3', removed_at: '2026-09-30T12:00:00Z', payments: [{ id: 'p3', status: 'confirmed', amount: 400 }] }),
    entry({ id: 'e4', tournament_id: 't2', payments: [{ id: 'p4', status: 'confirmed', amount: 400 }] }),
    entry({ id: 'e5', tournament_id: 't3' }),
    entry({ id: 'e6', player: { display_name: 'Bruno' }, payments: [{ id: 'p6', status: 'reported', amount: 400 }] }),
  ]

  it('lists entries of tournaments already played that still owe, without a reported transfer', () => {
    expect(unpaidEntries(tournaments, entries, NOW)).toEqual([
      { entryId: 'e1', holder: 'Ana', startsAt: new Date('2026-10-01T21:00:00Z'), tournamentName: 'Americano', due: 400 },
    ])
  })

  it('lists what was paid by who left or for a cancelled tournament', () => {
    expect(entryRefunds(tournaments, entries)).toEqual([
      { paymentId: 'p3', holder: 'Ana', startsAt: new Date('2026-10-01T21:00:00Z'), courtName: 'Torneo Americano', amount: 400 },
      { paymentId: 'p4', holder: 'Ana', startsAt: new Date('2026-10-01T21:00:00Z'), courtName: 'Torneo Suspendido', amount: 400 },
    ])
  })
})

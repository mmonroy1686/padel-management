import { describe, expect, it } from 'vitest'
import { holderLabel, leftPlayerRefunds, refundsDue, totalsOf, unpaidBookings, type OverviewBooking } from '@/lib/domain/payments-overview'

function booking(overrides: Partial<OverviewBooking> = {}): OverviewBooking {
  return {
    id: 'b1',
    starts_at: '2026-10-01T23:00:00+00:00',
    price: 1600,
    status: 'confirmed',
    guest_name: null,
    court: { name: 'Cancha 2' },
    player: { display_name: 'Martina' },
    payments: [],
    ...overrides,
  }
}

describe('holderLabel', () => {
  it('prefers the typed name, then the player, then a placeholder', () => {
    expect(holderLabel({ guest_name: 'Rodríguez', player: { display_name: 'Ana' } })).toBe('Rodríguez')
    expect(holderLabel({ guest_name: null, player: { display_name: 'Ana' } })).toBe('Ana')
    expect(holderLabel({ guest_name: null, player: null })).toBe('Sin nombre')
  })
})

describe('unpaidBookings', () => {
  it('lists played bookings that still owe money, with what is due', () => {
    const items = unpaidBookings([
      booking({ id: 'owes', payments: [{ id: 'p1', status: 'confirmed', amount: 600 }] }),
      booking({ id: 'paid', payments: [{ id: 'p2', status: 'confirmed', amount: 1600 }] }),
      booking({ id: 'reported', payments: [{ id: 'p3', status: 'reported', amount: 1600 }] }),
    ])
    expect(items).toEqual([
      {
        bookingId: 'owes',
        holder: 'Martina',
        startsAt: new Date('2026-10-01T23:00:00Z'),
        courtName: 'Cancha 2',
        due: 1000,
      },
    ])
  })
})

describe('refundsDue', () => {
  it('lists each confirmed payment of a cancelled booking', () => {
    const items = refundsDue([
      booking({
        status: 'cancelled',
        guest_name: 'Rodríguez',
        payments: [
          { id: 'p1', status: 'confirmed', amount: 1600 },
          { id: 'p2', status: 'refunded', amount: 1600 },
        ],
      }),
    ])
    expect(items).toEqual([
      { paymentId: 'p1', holder: 'Rodríguez', startsAt: new Date('2026-10-01T23:00:00Z'), courtName: 'Cancha 2', amount: 1600 },
    ])
  })
})

describe('open matches in Cobros', () => {
  const slots = [
    { position: 1, player_id: 'a', player: { display_name: 'Ana' } },
    { position: 2, player_id: 'b', player: { display_name: 'Bruno' } },
  ]
  const matchBooking = (overrides: Partial<OverviewBooking> = {}): OverviewBooking => ({
    id: 'mb',
    starts_at: '2026-09-28T23:00:00Z',
    price: 1600,
    status: 'confirmed',
    guest_name: null,
    player: null,
    court: { name: 'Cancha 2' },
    match_id: 'm1',
    match: { slots },
    payments: [{ id: 'p1', status: 'confirmed', amount: 400, payer_id: 'a', payer: { display_name: 'Ana' } }],
    ...overrides,
  })

  it('lists each player who still owes his share', () => {
    expect(unpaidBookings([matchBooking()])).toEqual([
      { bookingId: 'mb', holder: 'Bruno', startsAt: new Date('2026-09-28T23:00:00Z'), courtName: 'Cancha 2', due: 400, payerId: 'b' },
    ])
  })

  it('names who paid what the club has to give back', () => {
    expect(refundsDue([matchBooking({ status: 'cancelled' })])).toEqual([
      { paymentId: 'p1', holder: 'Ana', startsAt: new Date('2026-09-28T23:00:00Z'), courtName: 'Cancha 2', amount: 400 },
    ])
  })

  it('gives back what a player paid before the club took him out', () => {
    const left = matchBooking({ match: { slots: [{ position: 2, player_id: 'b', player: { display_name: 'Bruno' } }] } })
    expect(leftPlayerRefunds([left])).toEqual([
      { paymentId: 'p1', holder: 'Ana', startsAt: new Date('2026-09-28T23:00:00Z'), courtName: 'Cancha 2', amount: 400 },
    ])
    expect(leftPlayerRefunds([matchBooking()])).toEqual([])
  })
})

describe('totalsOf', () => {
  it('counts the items and adds up their amounts', () => {
    expect(totalsOf([{ due: 1200 }, { due: 300 }], (item) => item.due)).toEqual({ count: 2, total: 1500 })
  })

  it('is zero for an empty list', () => {
    expect(totalsOf([], () => 1)).toEqual({ count: 0, total: 0 })
  })
})

import { describe, expect, it } from 'vitest'
import { holderLabel, refundsDue, unpaidBookings, type OverviewBooking } from '@/lib/domain/payments-overview'

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

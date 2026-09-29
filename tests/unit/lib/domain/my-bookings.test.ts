import { describe, expect, it } from 'vitest'
import { splitMyBookings, toMyBookingView, type MyBookingRow } from '@/lib/domain/my-bookings'

const CLUB = { timezone: 'America/Montevideo', cancellation_notice_hours: 24, accepts_transfer: true }
const NOW = new Date('2026-10-01T12:00:00Z')

function row(overrides: Partial<MyBookingRow> = {}): MyBookingRow {
  return {
    id: 'b1',
    starts_at: '2026-10-03T23:00:00+00:00',
    ends_at: '2026-10-04T00:30:00+00:00',
    price: 1600,
    status: 'confirmed',
    court: { name: 'Cancha 2' },
    payments: [],
    ...overrides,
  }
}

describe('toMyBookingView', () => {
  it('describes the booking on the club clock', () => {
    expect(toMyBookingView(row(), CLUB, NOW)).toMatchObject({
      dateText: 'sábado 3 de octubre',
      timeText: '20:00 a 21:30',
      courtName: 'Cancha 2',
      upcoming: true,
      cancelled: false,
      paymentState: 'pending',
      amountDue: 1600,
      canReportTransfer: true,
      cancel: { allowed: true },
      rejectionReason: null,
    })
  })

  it('explains why it cannot be cancelled anymore', () => {
    const view = toMyBookingView(row({ starts_at: '2026-10-01T14:00:00+00:00', ends_at: '2026-10-01T15:30:00+00:00' }), CLUB, NOW)
    expect(view.cancel).toEqual({ allowed: false, reason: 'Ya no se puede cancelar: faltan menos de 24 h. Avisá al club.' })
  })

  it('stops offering the transfer once it is reported', () => {
    const view = toMyBookingView(
      row({ payments: [{ status: 'reported', amount: 1600, rejection_reason: null, created_at: '2026-10-01T10:00:00+00:00' }] }),
      CLUB,
      NOW,
    )
    expect(view).toMatchObject({ paymentState: 'reported', canReportTransfer: false })
  })

  it('shows why the club rejected the last transfer and lets her try again', () => {
    const view = toMyBookingView(
      row({ payments: [{ status: 'rejected', amount: 1600, rejection_reason: 'No llegó', created_at: '2026-10-01T10:00:00+00:00' }] }),
      CLUB,
      NOW,
    )
    expect(view).toMatchObject({ rejectionReason: 'No llegó', canReportTransfer: true })
  })

  it('does not offer transfers when the club does not take them', () => {
    expect(toMyBookingView(row(), { ...CLUB, accepts_transfer: false }, NOW).canReportTransfer).toBe(false)
  })

  it('keeps cancelled and played bookings out of the upcoming list', () => {
    expect(toMyBookingView(row({ status: 'cancelled' }), CLUB, NOW)).toMatchObject({ upcoming: false, cancelled: true })
    expect(
      toMyBookingView(row({ starts_at: '2026-09-30T23:00:00+00:00', ends_at: '2026-10-01T00:30:00+00:00' }), CLUB, NOW).upcoming,
    ).toBe(false)
  })
})

describe('splitMyBookings', () => {
  it('lists upcoming soonest first and past latest first', () => {
    const view = (id: string, upcoming: boolean) => ({ ...toMyBookingView(row({ id }), CLUB, NOW), upcoming })
    const { upcoming, past } = splitMyBookings([view('a', false), view('b', false), view('c', true), view('d', true)])
    expect(upcoming.map((v) => v.id)).toEqual(['c', 'd'])
    expect(past.map((v) => v.id)).toEqual(['b', 'a'])
  })
})

import { holderName } from './grid'
import { matchPlayerPayments, type SlotHolder } from './match-payments'
import { amountDue, paymentState, type PaymentStatus } from './payments'
import { toDate } from './time'

// What the Cobros screen lists besides reported transfers.

export type HolderRow = { guest_name: string | null; player: { display_name: string } | null }

export type OverviewPayment = {
  id: string
  status: PaymentStatus
  amount: number
  payer_id?: string | null
  payer?: { display_name: string } | null
}

export type OverviewBooking = HolderRow & {
  id: string
  starts_at: string | null
  price: number
  status: 'confirmed' | 'cancelled'
  court: { name: string } | null
  match_id?: string | null
  match?: { slots: SlotHolder[] } | null
  payments: OverviewPayment[]
}

export type UnpaidItem = { bookingId: string; holder: string; startsAt: Date; courtName: string; due: number; payerId?: string }
export type RefundItem = { paymentId: string; holder: string; startsAt: Date; courtName: string; amount: number }

export function holderLabel(row: HolderRow): string {
  return holderName(row.guest_name, row.player?.display_name ?? null) ?? 'Sin nombre'
}

const payerName = (payment: OverviewPayment, booking: OverviewBooking) => payment.payer?.display_name ?? holderLabel(booking)

// Played bookings whose confirmed payments do not cover the price yet; in a match, each player
// who has not covered his share.
export function unpaidBookings(played: OverviewBooking[]): UnpaidItem[] {
  return played.flatMap((booking) => {
    const base = { bookingId: booking.id, startsAt: toDate(booking.starts_at), courtName: booking.court?.name ?? '' }
    if (booking.match_id && booking.match) {
      const payments = booking.payments.map((payment) => ({ ...payment, payer_id: payment.payer_id ?? null }))
      return matchPlayerPayments(booking, booking.match.slots, payments)
        .filter((player) => player.state === 'pending')
        .map((player) => ({ ...base, holder: player.name, due: player.due, payerId: player.playerId }))
    }
    if (paymentState(booking, booking.payments) !== 'pending') return []
    return [{ ...base, holder: holderLabel(booking), due: amountDue(booking.price, booking.payments) }]
  })
}

// Money the club took for bookings that were cancelled afterwards: reception gives it back by hand.
export function refundsDue(cancelled: OverviewBooking[]): RefundItem[] {
  return cancelled.flatMap((booking) =>
    booking.payments
      .filter((payment) => payment.status === 'confirmed')
      .map((payment) => ({
        paymentId: payment.id,
        holder: payerName(payment, booking),
        startsAt: toDate(booking.starts_at),
        courtName: booking.court?.name ?? '',
        amount: payment.amount,
      })),
  )
}

// Confirmed payments of players who are no longer in a match that still goes on.
export function leftPlayerRefunds(matchBookings: OverviewBooking[]): RefundItem[] {
  return matchBookings.flatMap((booking) => {
    const inMatch = new Set((booking.match?.slots ?? []).flatMap((slot) => (slot.player_id ? [slot.player_id] : [])))
    return booking.payments
      .filter((payment) => payment.status === 'confirmed' && payment.payer_id && !inMatch.has(payment.payer_id))
      .map((payment) => ({
        paymentId: payment.id,
        holder: payerName(payment, booking),
        startsAt: toDate(booking.starts_at),
        courtName: booking.court?.name ?? '',
        amount: payment.amount,
      }))
  })
}

export type PaymentsTotals = { count: number; total: number }

// Count and money of one Cobros list, for the summary at the top of the screen.
export function totalsOf<T>(items: T[], amount: (item: T) => number): PaymentsTotals {
  return { count: items.length, total: items.reduce((sum, item) => sum + amount(item), 0) }
}

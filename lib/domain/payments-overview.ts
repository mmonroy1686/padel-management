import { holderName } from './grid'
import { amountDue, paymentState, type PaymentStatus } from './payments'
import { toDate } from './time'

// What the Cobros screen lists besides reported transfers.

export type HolderRow = { guest_name: string | null; player: { display_name: string } | null }

export type OverviewBooking = HolderRow & {
  id: string
  starts_at: string | null
  price: number
  status: 'confirmed' | 'cancelled'
  court: { name: string } | null
  payments: { id: string; status: PaymentStatus; amount: number }[]
}

export type UnpaidItem = { bookingId: string; holder: string; startsAt: Date; courtName: string; due: number }
export type RefundItem = { paymentId: string; holder: string; startsAt: Date; courtName: string; amount: number }

export function holderLabel(row: HolderRow): string {
  return holderName(row.guest_name, row.player?.display_name ?? null) ?? 'Sin nombre'
}

// Played bookings whose confirmed payments do not cover the price yet.
export function unpaidBookings(played: OverviewBooking[]): UnpaidItem[] {
  return played
    .filter((booking) => paymentState(booking, booking.payments) === 'pending')
    .map((booking) => ({
      bookingId: booking.id,
      holder: holderLabel(booking),
      startsAt: toDate(booking.starts_at),
      courtName: booking.court?.name ?? '',
      due: amountDue(booking.price, booking.payments),
    }))
}

// Money the club took for bookings that were cancelled afterwards: reception gives it back by hand.
export function refundsDue(cancelled: OverviewBooking[]): RefundItem[] {
  return cancelled.flatMap((booking) =>
    booking.payments
      .filter((payment) => payment.status === 'confirmed')
      .map((payment) => ({
        paymentId: payment.id,
        holder: holderLabel(booking),
        startsAt: toDate(booking.starts_at),
        courtName: booking.court?.name ?? '',
        amount: payment.amount,
      })),
  )
}

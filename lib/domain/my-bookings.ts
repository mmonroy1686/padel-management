import { cancellationStatus, type CancellationStatus } from './cancellation'
import { dayLongLabel, timeIn } from './format'
import { amountDue, paymentState, type PaymentState, type PaymentStatus } from './payments'
import { localDateOf, toDate } from './time'

export type MyBookingRow = {
  id: string
  starts_at: string | null
  ends_at: string | null
  price: number
  status: 'confirmed' | 'cancelled'
  court: { name: string } | null
  payments: { status: PaymentStatus; amount: number; rejection_reason: string | null; created_at: string }[]
}

export type MyBookingView = {
  id: string
  dateText: string
  timeText: string
  courtName: string
  price: number
  upcoming: boolean
  cancelled: boolean
  paymentState: PaymentState
  amountDue: number
  cancel: CancellationStatus
  canReportTransfer: boolean
  rejectionReason: string | null
}

type ClubRules = { timezone: string; cancellation_notice_hours: number; accepts_transfer: boolean }

export function toMyBookingView(row: MyBookingRow, club: ClubRules, now: Date): MyBookingView {
  const startsAt = toDate(row.starts_at)
  const endsAt = toDate(row.ends_at)
  const state = paymentState(row, row.payments)
  const latest = [...row.payments].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  const confirmed = row.status === 'confirmed'

  return {
    id: row.id,
    dateText: dayLongLabel(localDateOf(startsAt, club.timezone)),
    timeText: `${timeIn(startsAt, club.timezone)} a ${timeIn(endsAt, club.timezone)}`,
    courtName: row.court?.name ?? 'Cancha',
    price: row.price,
    upcoming: confirmed && endsAt > now,
    cancelled: !confirmed,
    paymentState: state,
    amountDue: amountDue(row.price, row.payments),
    cancel: cancellationStatus(startsAt, club.cancellation_notice_hours, now),
    canReportTransfer: confirmed && club.accepts_transfer && state === 'pending',
    rejectionReason: state === 'pending' && latest?.status === 'rejected' ? (latest.rejection_reason ?? 'sin motivo') : null,
  }
}

// Expects views in ascending start order (as the query returns them).
export function splitMyBookings(views: MyBookingView[]): { upcoming: MyBookingView[]; past: MyBookingView[] } {
  return {
    upcoming: views.filter((view) => view.upcoming),
    past: views.filter((view) => !view.upcoming).reverse().slice(0, 20),
  }
}

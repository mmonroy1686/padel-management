import { cancellationStatus, type CancellationStatus } from './cancellation'
import { dayLongLabel, timeIn } from './format'
import { shareFor } from './match-payments'
import { amountDue, paymentState, type PaymentState, type PaymentStatus } from './payments'
import { localDateOf, toDate } from './time'

export type MyBookingRow = {
  id: string
  starts_at: string | null
  ends_at: string | null
  price: number
  status: 'confirmed' | 'cancelled'
  court: { name: string } | null
  payments: {
    status: PaymentStatus
    amount: number
    rejection_reason: string | null
    created_at: string
    // Whose share a payment of a booking pays (1 the holder); null for the booking as a whole.
    payer_position?: number | null
  }[]
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
  matchId?: string | null
}

type ClubRules = { timezone: string; cancellation_notice_hours: number; accepts_transfer: boolean }

// The holder's own booking: the court is always split among 4, so the holder sees and pays his share (position 1,
// with the remainder), counting his own payments; a payment of the whole booking at the desk still makes it paid.
export function toMyHolderBookingView(row: MyBookingRow, club: ClubRules, now: Date): MyBookingView {
  const whole = toMyBookingView(row, club, now)
  // Paid at the desk, cancelled, or a transfer of the whole booking reported before shares existed: as it is.
  const wholeReported = row.payments.some((payment) => payment.status === 'reported' && payment.payer_position == null)
  if (whole.paymentState === 'paid' || whole.cancelled || wholeReported) return { ...whole, price: shareFor(row.price, 1) }
  const own = { ...row, price: shareFor(row.price, 1), payments: row.payments.filter((payment) => payment.payer_position === 1) }
  return { ...toMyBookingView(own, club, now), cancel: whole.cancel }
}

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

export type MyMatchBookingRow = Omit<MyBookingRow, 'payments'> & {
  match_id: string
  payments: (MyBookingRow['payments'][number] & { payer_id: string | null })[]
}

// A match booking seen by one of its players: his share, his payments. He leaves from the match page.
export function toMyMatchBookingView(
  row: MyMatchBookingRow,
  position: number,
  userId: string,
  club: ClubRules,
  now: Date,
): MyBookingView {
  const own = {
    ...row,
    price: shareFor(row.price, position),
    payments: row.payments.filter((payment) => payment.payer_id === userId),
  }
  return {
    ...toMyBookingView(own, club, now),
    matchId: row.match_id,
    cancel: { allowed: false, reason: 'Para bajarte, entrá al partido.' },
  }
}

// Expects views in ascending start order (as the query returns them).
export function splitMyBookings(views: MyBookingView[]): { upcoming: MyBookingView[]; past: MyBookingView[] } {
  return {
    upcoming: views.filter((view) => view.upcoming),
    past: views.filter((view) => !view.upcoming).reverse().slice(0, 20),
  }
}

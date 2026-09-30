import { passTotal, type DayUsePass, type PassStatus } from './day-use'
import { amountDue, paymentState } from './payments'
import type { OverviewPayment, RefundItem } from './payments-overview'
import { localDateOf, parseTime, zonedTime, type LocalDate } from './time'

// What lib/data/payments.ts reads for Cobros.
export type OverviewPass = {
  id: string
  on_date: string
  price: number
  discount_percent: number
  total: number | null
  status: PassStatus
  guest_name: string | null
  player: { display_name: string } | null
  product: { name: string; from_time: string } | null
  payments: OverviewPayment[]
}
export type UnpaidPassItem = { passId: string; holder: string; startsAt: Date; productName: string; due: number }

export function passStartsAt(onDate: LocalDate, fromTime: string | null | undefined, timezone: string): Date {
  return zonedTime(onDate, parseTime(fromTime ?? '00:00'), timezone)
}

const holderOf = (pass: OverviewPass) => pass.guest_name ?? pass.player?.display_name ?? 'Jugador'
const totalOf = (pass: OverviewPass) => pass.total ?? passTotal(pass.price, pass.discount_percent)

// Passes that already started (not cancelled) that still owe and have no transfer waiting for
// review. A free pass (a 100 % reward) owes nothing and never shows.
export function unpaidPasses(passes: OverviewPass[], now: Date, timezone: string): UnpaidPassItem[] {
  const today = localDateOf(now, timezone)
  return passes.flatMap((pass) => {
    if (pass.status === 'cancelled' || pass.on_date > today) return []
    if (passStartsAt(pass.on_date, pass.product?.from_time, timezone) > now) return []
    const total = totalOf(pass)
    if (paymentState({ price: total, status: 'confirmed' }, pass.payments) !== 'pending') return []
    return [
      {
        passId: pass.id,
        holder: holderOf(pass),
        startsAt: passStartsAt(pass.on_date, pass.product?.from_time, timezone),
        productName: pass.product?.name ?? 'Day use',
        due: amountDue(total, pass.payments),
      },
    ]
  })
}

// Money the club took for a pass that was cancelled: given back by hand.
export function passRefunds(passes: OverviewPass[], timezone: string): RefundItem[] {
  return passes.flatMap((pass) => {
    if (pass.status !== 'cancelled') return []
    return pass.payments
      .filter((payment) => payment.status === 'confirmed')
      .map((payment) => ({
        paymentId: payment.id,
        holder: holderOf(pass),
        startsAt: passStartsAt(pass.on_date, pass.product?.from_time, timezone),
        courtName: pass.product?.name ?? 'Day use',
        amount: payment.amount,
      }))
  })
}

// "Ingresos de hoy" in reception's summary: confirmed payments of the day's passes.
export function collectedToday(passes: Pick<DayUsePass, 'payments'>[]): number {
  return passes
    .flatMap((pass) => pass.payments)
    .filter((payment) => payment.status === 'confirmed')
    .reduce((sum, payment) => sum + payment.amount, 0)
}

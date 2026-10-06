import type { CategoryStatus, ChampionshipStatus, EntryStatus } from './championships'
import { amountDue, paymentState, type PaymentLike } from './payments'
import type { OverviewPayment, RefundItem } from './payments-overview'
import { parseTime, zonedTime } from './time'

// What lib/data/payments.ts reads for Cobros. If supabase-js infers a slightly different shape for the
// embeds, adjust these types to match; never cast the query result.
export type OverviewChampionshipEntry = {
  id: string
  status: EntryStatus
  player1: { name: string } | null
  player2: { name: string } | null
  payments: OverviewPayment[]
}
export type OverviewChampionship = {
  id: string
  name: string
  status: ChampionshipStatus
  windows: { on_date: string; from_time: string }[]
  categories: { id: string; name: string; price: number; status: CategoryStatus; entries: OverviewChampionshipEntry[] }[]
}
export type UnpaidChampionshipItem = { entryId: string; holder: string; startsAt: Date; what: string; due: number }

// The start of the first day of play, on the club's clock; null without days.
export function overviewStartsAt(championship: Pick<OverviewChampionship, 'windows'>, timezone: string): Date | null {
  const starts = championship.windows.map((window) => zonedTime(window.on_date, parseTime(window.from_time), timezone).getTime())
  return starts.length > 0 ? new Date(Math.min(...starts)) : null
}

const pairOf = (entry: OverviewChampionshipEntry) => `${entry.player1?.name ?? 'Jugador'} y ${entry.player2?.name ?? 'Jugador'}`
const whatOf = (championship: OverviewChampionship, category: { name: string }) => `Campeonato ${championship.name} · ${category.name}`

// Pairs with a place in championships that already started (not cancelled) that still owe and have no
// transfer waiting for review. Before it starts, reception charges from the championship page.
export function unpaidChampionshipEntries(rows: OverviewChampionship[], now: Date, timezone: string): UnpaidChampionshipItem[] {
  return rows.flatMap((championship) => {
    const startsAt = overviewStartsAt(championship, timezone)
    if (championship.status === 'cancelled' || !startsAt || startsAt > now) return []
    return championship.categories.flatMap((category) =>
      category.entries.flatMap((entry) => {
        const payments: PaymentLike[] = entry.payments
        if (entry.status !== 'active' || paymentState({ price: category.price, status: 'confirmed' }, payments) !== 'pending') return []
        return [{ entryId: entry.id, holder: pairOf(entry), startsAt, what: whatOf(championship, category), due: amountDue(category.price, payments) }]
      }),
    )
  })
}

// Money the club took for a pair that withdrew or was taken out (also by a cancelled category), or for a
// championship that was cancelled: given back by hand.
export function championshipRefunds(rows: OverviewChampionship[], timezone: string): RefundItem[] {
  return rows.flatMap((championship) => {
    const startsAt = overviewStartsAt(championship, timezone)
    if (!startsAt) return []
    return championship.categories.flatMap((category) =>
      category.entries.flatMap((entry) => {
        const gone = championship.status === 'cancelled' || entry.status === 'withdrawn' || entry.status === 'removed'
        if (!gone) return []
        return entry.payments
          .filter((payment) => payment.status === 'confirmed')
          .map((payment) => ({
            paymentId: payment.id,
            holder: pairOf(entry),
            startsAt,
            courtName: whatOf(championship, category),
            amount: payment.amount,
          }))
      }),
    )
  })
}

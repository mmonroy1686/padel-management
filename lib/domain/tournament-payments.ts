import type { OverviewPayment, RefundItem } from './payments-overview'
import { amountDue, paymentState, type PaymentLike, type PaymentState } from './payments'
import { toDate } from './time'
import type { EntryPayment, TournamentStatus } from './tournaments'

export type EntryPaymentView = { state: PaymentState; due: number; canReportTransfer: boolean; rejectionReason: string | null }

// Same rule as private.entry_due: the price minus confirmed payments. A free tournament is paid.
export function entryPaymentView(price: number, payments: EntryPayment[], acceptsTransfer: boolean): EntryPaymentView {
  const state = paymentState({ price, status: 'confirmed' }, payments)
  const latest = [...payments].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  return {
    state,
    due: amountDue(price, payments),
    canReportTransfer: acceptsTransfer && state === 'pending',
    rejectionReason: state === 'pending' && latest?.status === 'rejected' ? (latest.rejection_reason ?? 'sin motivo') : null,
  }
}

// What lib/data/payments.ts reads for Cobros.
export type OverviewTournament = { id: string; name: string; starts_at: string | null; price: number; status: TournamentStatus }
export type OverviewEntry = {
  id: string
  tournament_id: string
  guest_name: string | null
  removed_at: string | null
  player: { display_name: string } | null
  payments: OverviewPayment[]
}
export type UnpaidEntryItem = { entryId: string; holder: string; startsAt: Date; tournamentName: string; due: number }

const holderOf = (entry: OverviewEntry) => entry.guest_name ?? entry.player?.display_name ?? 'Jugador'

// Entries of tournaments that already started (not cancelled) that still owe and have no transfer
// waiting for review. Before it starts, reception charges from the tournament page.
export function unpaidEntries(tournaments: OverviewTournament[], entries: OverviewEntry[], now: Date): UnpaidEntryItem[] {
  const byId = new Map(tournaments.map((tournament) => [tournament.id, tournament]))
  return entries.flatMap((entry) => {
    const tournament = byId.get(entry.tournament_id)
    if (!tournament || tournament.status === 'cancelled' || entry.removed_at !== null) return []
    const startsAt = toDate(tournament.starts_at)
    const payments: PaymentLike[] = entry.payments
    if (startsAt > now || paymentState({ price: tournament.price, status: 'confirmed' }, payments) !== 'pending') return []
    return [{ entryId: entry.id, holder: holderOf(entry), startsAt, tournamentName: tournament.name, due: amountDue(tournament.price, payments) }]
  })
}

// Money the club took for an entry that left or a tournament that was cancelled: given back by hand.
export function entryRefunds(tournaments: OverviewTournament[], entries: OverviewEntry[]): RefundItem[] {
  const byId = new Map(tournaments.map((tournament) => [tournament.id, tournament]))
  return entries.flatMap((entry) => {
    const tournament = byId.get(entry.tournament_id)
    if (!tournament || (entry.removed_at === null && tournament.status !== 'cancelled')) return []
    return entry.payments
      .filter((payment) => payment.status === 'confirmed')
      .map((payment) => ({
        paymentId: payment.id,
        holder: holderOf(entry),
        startsAt: toDate(tournament.starts_at),
        courtName: `Torneo ${tournament.name}`,
        amount: payment.amount,
      }))
  })
}

import 'server-only'
import type { Club } from '@/lib/auth/viewer'
import {
  championshipRefunds,
  overviewStartsAt,
  unpaidChampionshipEntries,
  type UnpaidChampionshipItem,
} from '@/lib/domain/championship-payments'
import { passRefunds, passStartsAt, unpaidPasses, type UnpaidPassItem } from '@/lib/domain/day-use-payments'
import {
  holderLabel,
  leftPlayerRefunds,
  refundsDue,
  unpaidBookings,
  type MoneyKind,
  type RefundItem,
  type UnpaidItem,
} from '@/lib/domain/payments-overview'
import { localDateOf, toDate } from '@/lib/domain/time'
import { entryRefunds, unpaidEntries, type UnpaidEntryItem } from '@/lib/domain/tournament-payments'
import { createClient } from '@/lib/supabase/server'

export type ReportedTransfer = {
  id: string
  amount: number
  holder: string
  startsAt: Date | null
  courtName: string
  receiptUrl: string | null
}

export type PaymentsOverview = {
  transfers: ReportedTransfer[]
  unpaid: UnpaidItem[]
  unpaidEntries: UnpaidEntryItem[]
  unpaidPasses: UnpaidPassItem[]
  unpaidChampionships: UnpaidChampionshipItem[]
  refunds: (RefundItem & { kind: MoneyKind })[]
}

const RECEIPT_URL_SECONDS = 300

const BOOKING_SELECT =
  'id, starts_at, price, status, guest_name, match_id, court:courts(name), player:profiles!bookings_player_id_fkey(display_name), match:open_matches!bookings_match_id_fkey(slots:match_slots(position, player_id, player:profiles(display_name))), payments(id, status, amount, payer_id, payer:profiles!payments_payer_id_fkey(display_name))'

const PASS_SELECT =
  'id, on_date, price, discount_percent, total, status, guest_name, player:profiles!day_use_passes_player_id_fkey(display_name), product:day_use_products!day_use_passes_product_in_club(name, from_time), payments!payments_pass_in_club(id, status, amount)'

const CHAMPIONSHIP_SELECT =
  'id, name, status, windows:championship_windows!championship_windows_championship_in_club(on_date, from_time), categories:championship_categories!championship_categories_championship_in_club(id, name, price, status, entries:championship_entries!championship_entries_category_in_club(id, status, player1:players!championship_entries_player1_in_club(name), player2:players!championship_entries_player2_in_club(name), payments!payments_championship_entry_in_club(id, status, amount)))'

// Everything the Cobros screen needs, read with the staff session.
export async function loadPaymentsOverview(club: Club, now = new Date()): Promise<PaymentsOverview> {
  const supabase = await createClient()
  const since = new Date(now.getTime() - 30 * 86_400_000)

  const [reported, played, cancelled, matchBookings, tournaments, passes, championships] = await Promise.all([
    supabase
      .from('payments')
      .select(
        'id, amount, receipt_path, payer:profiles!payments_payer_id_fkey(display_name), booking:bookings(starts_at, guest_name, court:courts(name), player:profiles!bookings_player_id_fkey(display_name)), entry:tournament_entries!payments_entry_in_club(tournament:tournaments!tournament_entries_tournament_in_club(name, starts_at)), pass:day_use_passes!payments_pass_in_club(on_date, product:day_use_products!day_use_passes_product_in_club(name, from_time)), pair:championship_entries!payments_championship_entry_in_club(category:championship_categories!championship_entries_category_in_club(name, championship:championships!championship_categories_championship_in_club(name, windows:championship_windows!championship_windows_championship_in_club(on_date, from_time))))',
      )
      .eq('club_id', club.id)
      .eq('status', 'reported')
      .order('created_at'),
    supabase
      .from('bookings')
      .select(BOOKING_SELECT)
      .eq('club_id', club.id)
      .eq('status', 'confirmed')
      .lt('ends_at', now.toISOString())
      .gt('ends_at', since.toISOString())
      .order('starts_at', { ascending: false }),
    supabase
      .from('bookings')
      .select(BOOKING_SELECT)
      .eq('club_id', club.id)
      .eq('status', 'cancelled')
      .gt('starts_at', since.toISOString())
      .order('starts_at', { ascending: false }),
    supabase
      .from('bookings')
      .select(BOOKING_SELECT)
      .eq('club_id', club.id)
      .eq('status', 'confirmed')
      .not('match_id', 'is', null)
      .gt('starts_at', since.toISOString()),
    supabase.from('tournaments').select('id, name, starts_at, price, status').eq('club_id', club.id).gt('starts_at', since.toISOString()),
    supabase
      .from('day_use_passes')
      .select(PASS_SELECT)
      .eq('club_id', club.id)
      // Also passes cancelled lately whatever their date, so a refund of an old pass shows up.
      .or(`on_date.gte.${localDateOf(since, club.timezone)},cancelled_at.gte.${since.toISOString()}`)
      .order('on_date', { ascending: false }),
    // Championships created in the last 180 days: a pair pays or gets money back around its dates.
    supabase
      .from('championships')
      .select(CHAMPIONSHIP_SELECT)
      .eq('club_id', club.id)
      .neq('status', 'draft')
      .gt('created_at', new Date(now.getTime() - 180 * 86_400_000).toISOString()),
  ])
  if (reported.error) throw reported.error
  if (played.error) throw played.error
  if (cancelled.error) throw cancelled.error
  if (matchBookings.error) throw matchBookings.error
  if (tournaments.error) throw tournaments.error
  if (passes.error) throw passes.error
  if (championships.error) throw championships.error

  const entries =
    tournaments.data.length > 0
      ? await supabase
          .from('tournament_entries')
          .select(
            'id, tournament_id, guest_name, removed_at, player:profiles!tournament_entries_player_id_fkey(display_name), payments!payments_entry_in_club(id, status, amount)',
          )
          .in('tournament_id', tournaments.data.map((tournament) => tournament.id))
      : { data: [], error: null }
  if (entries.error) throw entries.error

  // Receipts are private: short-lived signed URLs, made with the staff session.
  const signedUrls = new Map<string, string>()
  const paths = reported.data.flatMap((payment) => (payment.receipt_path ? [payment.receipt_path] : []))
  if (paths.length > 0) {
    const { data: signed, error } = await supabase.storage.from('receipts').createSignedUrls(paths, RECEIPT_URL_SECONDS)
    if (error) throw error
    for (const item of signed ?? []) if (item.path && item.signedUrl) signedUrls.set(item.path, item.signedUrl)
  }

  return {
    transfers: reported.data.map((payment) => {
      const tournament = payment.entry?.tournament ?? null
      const pass = payment.pass ?? null
      const category = payment.pair?.category ?? null
      const championship = category?.championship ?? null
      return {
        id: payment.id,
        amount: payment.amount,
        holder: payment.payer?.display_name ?? (payment.booking ? holderLabel(payment.booking) : 'Sin nombre'),
        startsAt: payment.booking
          ? toDate(payment.booking.starts_at)
          : tournament
            ? toDate(tournament.starts_at)
            : pass
              ? passStartsAt(pass.on_date, pass.product?.from_time, club.timezone)
              : championship
                ? overviewStartsAt(championship, club.timezone)
                : null,
        courtName:
          payment.booking?.court?.name ??
          (tournament
            ? `Torneo ${tournament.name}`
            : pass
              ? (pass.product?.name ?? '')
              : championship && category
                ? `Campeonato ${championship.name} · ${category.name}`
                : ''),
        receiptUrl: payment.receipt_path ? (signedUrls.get(payment.receipt_path) ?? null) : null,
      }
    }),
    unpaid: unpaidBookings(played.data),
    unpaidEntries: unpaidEntries(tournaments.data, entries.data, now),
    unpaidPasses: unpaidPasses(passes.data, now, club.timezone),
    unpaidChampionships: unpaidChampionshipEntries(championships.data, now, club.timezone),
    refunds: [
      ...[...refundsDue(cancelled.data), ...leftPlayerRefunds(matchBookings.data)].map((item) => ({ ...item, kind: 'booking' as const })),
      ...entryRefunds(tournaments.data, entries.data).map((item) => ({ ...item, kind: 'tournament' as const })),
      ...passRefunds(passes.data, club.timezone).map((item) => ({ ...item, kind: 'day_use' as const })),
      ...championshipRefunds(championships.data, club.timezone).map((item) => ({ ...item, kind: 'championship' as const })),
    ],
  }
}

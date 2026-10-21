import 'server-only'
import type { Club } from '@/lib/auth/viewer'
import {
  competitionsToday,
  courtItems,
  todayLines,
  type CourtItem,
  type TodayLine,
  type TurnBookingRow,
} from '@/lib/domain/club-home'
import { toOccupancy } from '@/lib/domain/grid'
import { totalsOf, type PaymentsTotals } from '@/lib/domain/payments-overview'
import { addDays, localDateOf, zonedTime } from '@/lib/domain/time'
import { createClient } from '@/lib/supabase/server'
import { loadInside } from './day-use'
import { loadMatches } from './matches'
import { loadDayWaits } from './waitlist'

export type ClubHomeData = { items: CourtItem[]; today: TodayLine[]; transfers: PaymentsTotals }

// booking_players reaches profiles through player_id and created_by: the hint picks the player.
const TURN_SELECT =
  'id, occupancy_id, price, player_id, guest_name, match_id, player:profiles!bookings_player_id_fkey(display_name), match:open_matches!bookings_match_id_fkey(slots:match_slots(position, player_id, player:profiles(display_name))), players:booking_players(position, player_id, name, player:profiles!booking_players_player_id_fkey(display_name)), payments(status, amount, payer_id, payer_position)'

// If supabase-js infers a slightly different shape for the embeds, adjust this type to match; never cast.
type HomeBookingRow = TurnBookingRow & { occupancy_id: string | null }

// Everything the Inicio shows, read in parallel with the staff session: the club's day (occupancies, bookings with
// their players and payments, notes), forming matches, day use inside, waits and reported transfers.
export async function loadClubHome(club: Club, now = new Date()): Promise<ClubHomeData> {
  const supabase = await createClient()
  const today = localDateOf(now, club.timezone)
  const dayStart = zonedTime(today, 0, club.timezone)
  const dayEnd = zonedTime(addDays(today, 1), 0, club.timezone)
  const from = dayStart.toISOString()
  const to = dayEnd.toISOString()

  const [courts, occupancies, bookings, notes, reported, forming, inside, waits] = await Promise.all([
    supabase.from('courts').select('id, name').eq('club_id', club.id).order('sort_order'),
    supabase
      .from('court_occupancy')
      .select('id, court_id, kind, starts_at, ends_at, tournament_id, championship_id')
      .eq('club_id', club.id)
      .lt('starts_at', to)
      .gt('ends_at', from),
    supabase
      .from('bookings')
      .select(TURN_SELECT)
      .eq('club_id', club.id)
      .eq('status', 'confirmed')
      .lt('starts_at', to)
      .gt('ends_at', from),
    supabase.rpc('occupancy_notes', { p_club_id: club.id, p_from: from, p_to: to }),
    supabase.from('payments').select('amount').eq('club_id', club.id).eq('status', 'reported'),
    loadMatches(club, { from: dayStart, to: dayEnd }, ['forming']),
    loadInside(club, today),
    loadDayWaits(club, today),
  ])
  if (courts.error) throw courts.error
  if (occupancies.error) throw occupancies.error
  if (bookings.error) throw bookings.error
  if (notes.error) throw notes.error
  if (reported.error) throw reported.error

  const noteById = new Map((notes.data ?? []).map((row) => [row.id, row.note]))
  const day = occupancies.data.map((row) => toOccupancy({ ...row, note: noteById.get(row.id) ?? null }, 'staff'))
  const turns: HomeBookingRow[] = bookings.data

  return {
    items: courtItems({ courts: courts.data, occupancies: day, bookings: turns }),
    today: todayLines({
      forming: forming.length,
      competitions: competitionsToday(day),
      inside: inside.length,
      waiting: waits.length,
    }),
    transfers: totalsOf(reported.data, (payment) => payment.amount),
  }
}

import 'server-only'
import type { Club } from '@/lib/auth/viewer'
import { buildDayGrid, holderName, toOccupancy, type DayGrid, type GridBooking } from '@/lib/domain/grid'
import { matchPlayerPayments, type SlotHolder } from '@/lib/domain/match-payments'
import { amountDue, paymentState, type PaymentStatus } from '@/lib/domain/payments'
import { daySlots, type ClubSchedule } from '@/lib/domain/slots'
import { addDays, zonedTime, type LocalDate } from '@/lib/domain/time'
import { loadMatches } from './matches'
import { createClient } from '@/lib/supabase/server'

export function scheduleOf(club: Club): ClubSchedule {
  return { timezone: club.timezone, opensAt: club.opens_at, closesAt: club.closes_at, slotMinutes: club.slot_minutes }
}

// If supabase-js infers a slightly different shape for the embeds, adjust this type to match;
// never cast the query result.
type BookingRow = {
  id: string
  occupancy_id: string | null
  player_id: string | null
  guest_name: string | null
  price: number
  status: 'confirmed' | 'cancelled'
  source: 'online' | 'reception'
  series_id: string | null
  match_id: string | null
  player: { display_name: string } | null
  match: { slots: SlotHolder[] } | null
  payments: { status: PaymentStatus; amount: number; payer_id: string | null }[]
}

function toGridBooking(row: BookingRow, occupancyId: string, viewerId: string): GridBooking {
  const slots = row.match?.slots ?? []
  return {
    id: row.id,
    occupancyId,
    isMine: row.player_id === viewerId || slots.some((slot) => slot.player_id === viewerId),
    holderName: holderName(row.guest_name, row.player?.display_name ?? null) ?? (row.match_id ? 'Partido abierto' : null),
    playerId: row.player_id,
    price: row.price,
    source: row.source,
    seriesId: row.series_id,
    paymentState: paymentState(row, row.payments),
    amountDue: amountDue(row.price, row.payments),
    matchId: row.match_id,
    matchPlayers: row.match ? matchPlayerPayments(row, slots, row.payments) : [],
  }
}

// Everything the grid needs for one day, read with the viewer's session: RLS decides whose
// bookings come back (a player gets only hers; staff get the whole club). Block reasons only
// go to staff (toOccupancy).
export async function loadDayGrid(
  club: Club,
  date: LocalDate,
  viewer: { userId: string; audience: 'player' | 'staff' },
  now = new Date(),
): Promise<DayGrid> {
  const { userId: viewerId, audience } = viewer
  const supabase = await createClient()
  const dayStart = zonedTime(date, 0, club.timezone).toISOString()
  const dayEnd = zonedTime(addDays(date, 1), 0, club.timezone).toISOString()

  const [courts, rules, occupancies, bookings, notes, matches] = await Promise.all([
    supabase
      .from('courts')
      .select('id, name, is_covered')
      .eq('club_id', club.id)
      .eq('is_active', true)
      .order('sort_order'),
    supabase.from('pricing_rules').select('weekdays, from_time, to_time, price').eq('club_id', club.id),
    supabase
      .from('court_occupancy')
      .select('id, court_id, kind, starts_at, ends_at, tournament_id')
      .eq('club_id', club.id)
      .lt('starts_at', dayEnd)
      .gt('ends_at', dayStart),
    supabase
      .from('bookings')
      .select(
        'id, occupancy_id, player_id, guest_name, price, status, source, series_id, match_id, player:profiles!bookings_player_id_fkey(display_name), match:open_matches!bookings_match_id_fkey(slots:match_slots(position, player_id, player:profiles(display_name))), payments(status, amount, payer_id)',
      )
      .eq('club_id', club.id)
      .eq('status', 'confirmed')
      .lt('starts_at', dayEnd)
      .gt('ends_at', dayStart),
    // Members cannot read court_occupancy.note (column privileges); staff get it from this RPC.
    audience === 'staff'
      ? supabase.rpc('occupancy_notes', { p_club_id: club.id, p_from: dayStart, p_to: dayEnd })
      : Promise.resolve({ data: [] as { id: string; note: string }[], error: null }),
    loadMatches(club, { from: new Date(dayStart), to: new Date(dayEnd) }),
  ])
  if (courts.error) throw courts.error
  if (rules.error) throw rules.error
  if (occupancies.error) throw occupancies.error
  if (bookings.error) throw bookings.error
  if (notes.error) throw notes.error
  const noteById = new Map((notes.data ?? []).map((row) => [row.id, row.note]))

  return buildDayGrid({
    date,
    now,
    slots: daySlots(scheduleOf(club), date),
    courts: courts.data.map((court) => ({ id: court.id, name: court.name, isCovered: court.is_covered })),
    rules: rules.data.map((rule) => ({
      weekdays: rule.weekdays,
      fromTime: rule.from_time,
      toTime: rule.to_time,
      price: rule.price,
    })),
    occupancies: occupancies.data.map((row) => toOccupancy({ ...row, note: noteById.get(row.id) ?? null }, audience)),
    bookings: bookings.data.flatMap((row: BookingRow) =>
      row.occupancy_id ? [toGridBooking(row, row.occupancy_id, viewerId)] : [],
    ),
    matches,
  })
}

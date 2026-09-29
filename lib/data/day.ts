import 'server-only'
import type { Club } from '@/lib/auth/viewer'
import { buildDayGrid, holderName, type DayGrid, type GridBooking } from '@/lib/domain/grid'
import { amountDue, paymentState, type PaymentStatus } from '@/lib/domain/payments'
import { daySlots, type ClubSchedule } from '@/lib/domain/slots'
import { addDays, toDate, zonedTime, type LocalDate } from '@/lib/domain/time'
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
  player: { display_name: string } | null
  payments: { status: PaymentStatus; amount: number }[]
}

function toGridBooking(row: BookingRow, occupancyId: string, viewerId: string): GridBooking {
  return {
    id: row.id,
    occupancyId,
    isMine: row.player_id === viewerId,
    holderName: holderName(row.guest_name, row.player?.display_name ?? null),
    playerId: row.player_id,
    price: row.price,
    source: row.source,
    seriesId: row.series_id,
    paymentState: paymentState(row, row.payments),
    amountDue: amountDue(row.price, row.payments),
  }
}

// Everything the grid needs for one day, read with the viewer's session: RLS decides whose
// bookings come back (a player gets only hers; staff get the whole club).
export async function loadDayGrid(club: Club, date: LocalDate, viewerId: string, now = new Date()): Promise<DayGrid> {
  const supabase = await createClient()
  const dayStart = zonedTime(date, 0, club.timezone).toISOString()
  const dayEnd = zonedTime(addDays(date, 1), 0, club.timezone).toISOString()

  const [courts, rules, occupancies, bookings] = await Promise.all([
    supabase
      .from('courts')
      .select('id, name, is_covered')
      .eq('club_id', club.id)
      .eq('is_active', true)
      .order('sort_order'),
    supabase.from('pricing_rules').select('weekdays, from_time, to_time, price').eq('club_id', club.id),
    supabase
      .from('court_occupancy')
      .select('id, court_id, kind, starts_at, ends_at, note')
      .eq('club_id', club.id)
      .lt('starts_at', dayEnd)
      .gt('ends_at', dayStart),
    supabase
      .from('bookings')
      .select(
        'id, occupancy_id, player_id, guest_name, price, status, source, series_id, player:profiles!bookings_player_id_fkey(display_name), payments(status, amount)',
      )
      .eq('club_id', club.id)
      .eq('status', 'confirmed')
      .lt('starts_at', dayEnd)
      .gt('ends_at', dayStart),
  ])
  if (courts.error) throw courts.error
  if (rules.error) throw rules.error
  if (occupancies.error) throw occupancies.error
  if (bookings.error) throw bookings.error

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
    occupancies: occupancies.data.map((o) => ({
      id: o.id,
      courtId: o.court_id,
      kind: o.kind,
      note: o.note,
      startsAt: toDate(o.starts_at),
      endsAt: toDate(o.ends_at),
    })),
    bookings: bookings.data.flatMap((row: BookingRow) =>
      row.occupancy_id ? [toGridBooking(row, row.occupancy_id, viewerId)] : [],
    ),
  })
}

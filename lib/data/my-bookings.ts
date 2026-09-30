import 'server-only'
import type { Club } from '@/lib/auth/viewer'
import { splitMyBookings, toMyBookingView, toMyMatchBookingView, type MyBookingView } from '@/lib/domain/my-bookings'
import { createClient } from '@/lib/supabase/server'

// The player's bookings and his share of each match booking, what Inicio lists (fase 3a moved
// "Mis reservas" there). Upcoming ones in start order; past and cancelled, newest first.
export async function loadMyBookings(
  viewer: { userId: string; club: Club },
  now = new Date(),
): Promise<{ upcoming: MyBookingView[]; past: MyBookingView[] }> {
  const { club } = viewer
  const supabase = await createClient()
  const [own, spots] = await Promise.all([
    supabase
      .from('bookings')
      .select('id, starts_at, ends_at, price, status, court:courts(name), payments(status, amount, rejection_reason, created_at)')
      .eq('player_id', viewer.userId)
      .order('starts_at', { ascending: true }),
    supabase.from('match_slots').select('position, match:open_matches(booking_id)').eq('player_id', viewer.userId),
  ])
  if (own.error) throw own.error
  if (spots.error) throw spots.error

  const positionByBooking = new Map(
    spots.data.flatMap((spot) => (spot.match?.booking_id ? [[spot.match.booking_id, spot.position] as const] : [])),
  )
  const matchBookings =
    positionByBooking.size > 0
      ? await supabase
          .from('bookings')
          .select(
            'id, starts_at, ends_at, price, status, match_id, court:courts(name), payments(status, amount, rejection_reason, created_at, payer_id)',
          )
          .in('id', [...positionByBooking.keys()])
      : { data: [], error: null }
  if (matchBookings.error) throw matchBookings.error

  const rows = [
    ...own.data.map((row) => ({ startsAt: row.starts_at ?? '', view: toMyBookingView(row, club, now) })),
    ...matchBookings.data.flatMap((row) =>
      row.match_id
        ? [
            {
              startsAt: row.starts_at ?? '',
              view: toMyMatchBookingView({ ...row, match_id: row.match_id }, positionByBooking.get(row.id) ?? 2, viewer.userId, club, now),
            },
          ]
        : [],
    ),
  ].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
  return splitMyBookings(rows.map((item) => item.view))
}

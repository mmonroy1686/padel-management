import { daySlots } from '../../../lib/domain/slots'
import { localDateOf } from '../../../lib/domain/time'
import { adminClient, clubRow, type TestUser } from './admin'

export type PlayingBooking = { bookingId: string; courtName: string; time: string }

// A booking of the slot being played right now, inserted directly (the service role skips the rules that keep
// a booking from starting in the past). Null outside the club's hours, or when the slot ends within 5 minutes
// (it would move to "Pendientes de cobro" in the middle of the test).
export async function insertPlayingBooking(user: TestUser, price = 1200): Promise<PlayingBooking | null> {
  const admin = adminClient()
  const club = await clubRow(admin)
  const now = new Date()
  const schedule = { timezone: club.timezone, opensAt: club.opens_at, closesAt: club.closes_at, slotMinutes: club.slot_minutes }
  const slot = daySlots(schedule, localDateOf(now, club.timezone)).find(
    (candidate) => candidate.startsAt <= now && candidate.endsAt.getTime() - now.getTime() > 5 * 60_000,
  )
  if (!slot) return null

  const { data: courts, error } = await admin
    .from('courts')
    .select('id, name')
    .eq('club_id', club.id)
    .eq('is_active', true)
    .order('sort_order')
  if (error) throw error
  const period = `[${slot.startsAt.toISOString()},${slot.endsAt.toISOString()})`
  for (const court of courts) {
    const occupancy = await admin
      .from('court_occupancy')
      .insert({ club_id: club.id, court_id: court.id, kind: 'booking', period, created_by: user.id })
      .select('id')
      .single()
    if (occupancy.error?.code === '23P01') continue
    if (occupancy.error) throw occupancy.error

    const booking = await admin
      .from('bookings')
      .insert({
        club_id: club.id,
        court_id: court.id,
        period,
        player_id: user.id,
        source: 'online',
        price,
        occupancy_id: occupancy.data.id,
        created_by: user.id,
      })
      .select('id')
      .single()
    if (booking.error) throw booking.error
    return { bookingId: booking.data.id, courtName: court.name, time: slot.label }
  }
  throw new Error('No hay ninguna cancha libre en el turno de ahora: corré node scripts/demo-data.mjs --clean')
}

export async function paymentsOf(bookingId: string) {
  const { data, error } = await adminClient()
    .from('payments')
    .select('method, amount, status, payer_position, receipt_path')
    .eq('booking_id', bookingId)
    .order('amount')
  if (error) throw error
  return data
}

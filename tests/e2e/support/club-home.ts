import { daySlots } from '../../../lib/domain/slots'
import { localDateOf } from '../../../lib/domain/time'
import { adminClient, clubRow, type TestUser } from './admin'

export type InsertedBooking = { bookingId: string; courtName: string }
export type PlayingBooking = InsertedBooking & { time: string }

// A booking of that period on the first active court that is free then, inserted directly (the service role skips
// the rules that keep a booking from starting in the past or off the grid).
async function insertBooking(user: TestUser, period: { startsAt: Date; endsAt: Date }, price: number): Promise<InsertedBooking> {
  const admin = adminClient()
  const club = await clubRow(admin)
  const { data: courts, error } = await admin
    .from('courts')
    .select('id, name')
    .eq('club_id', club.id)
    .eq('is_active', true)
    .order('sort_order')
  if (error) throw error
  const range = `[${period.startsAt.toISOString()},${period.endsAt.toISOString()})`
  for (const court of courts) {
    const occupancy = await admin
      .from('court_occupancy')
      .insert({ club_id: club.id, court_id: court.id, kind: 'booking', period: range, created_by: user.id })
      .select('id')
      .single()
    if (occupancy.error?.code === '23P01') continue
    if (occupancy.error) throw occupancy.error

    const booking = await admin
      .from('bookings')
      .insert({
        club_id: club.id,
        court_id: court.id,
        period: range,
        player_id: user.id,
        source: 'online',
        price,
        occupancy_id: occupancy.data.id,
        created_by: user.id,
      })
      .select('id')
      .single()
    if (booking.error) throw booking.error
    return { bookingId: booking.data.id, courtName: court.name }
  }
  throw new Error('No hay ninguna cancha libre en ese horario: corré node scripts/demo-data.mjs --clean')
}

// A booking of the slot being played right now. Null outside the club's hours, or when the slot ends within 5
// minutes (it would leave "En cancha ahora" in the middle of the test).
export async function insertPlayingBooking(user: TestUser, price = 1200): Promise<PlayingBooking | null> {
  const club = await clubRow(adminClient())
  const now = new Date()
  const schedule = { timezone: club.timezone, opensAt: club.opens_at, closesAt: club.closes_at, slotMinutes: club.slot_minutes }
  const slot = daySlots(schedule, localDateOf(now, club.timezone)).find(
    (candidate) => candidate.startsAt <= now && candidate.endsAt.getTime() - now.getTime() > 5 * 60_000,
  )
  if (!slot) return null
  return { ...(await insertBooking(user, slot, price)), time: slot.label }
}

// An hour-long booking that ended 10 minutes ago, off the grid on purpose: while it owes, it stays in "En cancha
// ahora" for 20 more minutes. Null when it would not have started today.
export async function insertRecentBooking(user: TestUser, price = 1200): Promise<InsertedBooking | null> {
  const club = await clubRow(adminClient())
  const now = new Date()
  const endsAt = new Date(Math.floor(now.getTime() / 60_000) * 60_000 - 10 * 60_000)
  const startsAt = new Date(endsAt.getTime() - 60 * 60_000)
  if (localDateOf(startsAt, club.timezone) !== localDateOf(now, club.timezone)) return null
  return insertBooking(user, { startsAt, endsAt }, price)
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

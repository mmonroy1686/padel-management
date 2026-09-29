import { daySlots } from '../../../lib/domain/slots'
import type { LocalDate } from '../../../lib/domain/time'
import { adminClient, clubRow, signedInClient, type TestUser } from './admin'
import { RECEIPT_PNG } from './files'

export type BookedSlot = { bookingId: string; courtName: string; time: string }

// Books, as the player and through book_slot, the first slot of that day she can take.
export async function bookFirstFreeSlot(user: TestUser, day: LocalDate): Promise<BookedSlot> {
  const admin = adminClient()
  const club = await clubRow(admin)
  const client = await signedInClient(user)
  const { data: courts, error } = await admin
    .from('courts')
    .select('id, name')
    .eq('club_id', club.id)
    .eq('is_active', true)
    .order('sort_order')
  if (error) throw error

  const schedule = { timezone: club.timezone, opensAt: club.opens_at, closesAt: club.closes_at, slotMinutes: club.slot_minutes }
  for (const slot of daySlots(schedule, day)) {
    for (const court of courts) {
      const booked = await client.rpc('book_slot', { p_court_id: court.id, p_starts_at: slot.startsAt.toISOString() })
      if (booked.error?.message === 'slot_taken' || booked.error?.message === 'busy_at_that_time') continue
      if (booked.error) throw booked.error
      return { bookingId: booked.data.id, courtName: court.name, time: slot.label }
    }
  }
  throw new Error(`No quedó ningún turno libre el ${day}`)
}

// Uploads a receipt and reports the transfer, as the player.
export async function reportTransferAs(user: TestUser, bookingId: string): Promise<void> {
  const client = await signedInClient(user)
  const path = `${user.id}/${bookingId}-e2e.png`
  const upload = await client.storage.from('receipts').upload(path, RECEIPT_PNG, { contentType: 'image/png' })
  if (upload.error) throw upload.error
  const report = await client.rpc('report_transfer', { p_booking_id: bookingId, p_receipt_path: path })
  if (report.error) throw report.error
}

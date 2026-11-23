import { parseTime, zonedTime, type LocalDate } from '../../../lib/domain/time'
import { adminClient, clubRow, type TestUser } from './admin'

// The player says she is usually free that weekday in that band (what slot_candidates reads).
export async function setUsuallyFree(user: TestUser, weekday: number, band: 'morning' | 'afternoon' | 'night'): Promise<void> {
  const { error } = await adminClient().from('player_availability').insert({ user_id: user.id, weekday, band })
  if (error) throw error
}

// A rerun on the same database: cancel what an earlier run left forming at that time, so the slot is free again.
export async function clearMatchesAt(day: LocalDate, time: string): Promise<void> {
  const admin = adminClient()
  const club = await clubRow(admin)
  const { error } = await admin
    .from('open_matches')
    .update({ status: 'cancelled', cancel_reason: 'by_club', cancelled_at: new Date().toISOString() })
    .eq('club_id', club.id)
    .eq('status', 'forming')
    .eq('starts_at', zonedTime(day, parseTime(time), club.timezone).toISOString())
  if (error) throw error
}

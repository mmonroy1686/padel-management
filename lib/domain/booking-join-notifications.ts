import { dayLongLabel, timeIn } from './format'
import { localDateOf } from './time'

// The aviso to a booking's holder when someone joins it from the shared link. The database writes it
// (public.join_booking); the app shows it in /avisos and mails it with the same words.

export const BOOKING_JOIN_KIND = 'booking_join' as const
export type BookingJoinKind = typeof BOOKING_JOIN_KIND
export type BookingJoinData = { joinerName: string; startsAt: Date; courtName: string; free: number }

export function readBookingJoinData(data: unknown): BookingJoinData | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const record = data as Record<string, unknown>
  const joinerName = typeof record.joiner_name === 'string' && record.joiner_name.trim() ? record.joiner_name : null
  const courtName = typeof record.court_name === 'string' ? record.court_name : null
  const startsAt = typeof record.starts_at === 'string' ? new Date(record.starts_at) : null
  const free = typeof record.free === 'number' ? Math.max(0, record.free) : 0
  if (!joinerName || !courtName || !startsAt || Number.isNaN(startsAt.getTime())) return null
  return { joinerName, startsAt, courtName, free }
}

export function bookingJoinText(data: BookingJoinData, timezone: string): { title: string; body: string } {
  const when = `${dayLongLabel(localDateOf(data.startsAt, timezone))} a las ${timeIn(data.startsAt, timezone)}`
  return {
    title: `${data.joinerName} se sumó a tu turno`,
    body: `${when}, ${data.courtName}. ${
      data.free === 0 ? 'Ya están los 4.' : data.free === 1 ? 'Falta 1.' : `Faltan ${data.free}.`
    }`,
  }
}

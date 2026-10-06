import { dayLabel, timeIn, WEEKDAYS_SHORT } from './format'
import type { Slot } from './slots'
import { formatMinutes, localDateOf, parseLocalDate, weekdayOf, type LocalDate } from './time'

// A player waits for at most this many slots at once; create_slot_wait checks it too (too_many_waits).
export const MAX_ACTIVE_WAITS = 3

export type WaitRow = { id: string; on_date: string; from_time: string; to_time: string; court_ids: string[] }
export type Wait = { id: string; date: LocalDate; fromTime: string; toTime: string; courtIds: string[] }
// A wait as a line of text: Inicio's "Esperando turno" and the full-waits list of the sheet.
export type WaitItem = { id: string; text: string }
// A wait in the club's "En espera" panel.
export type DayWait = { id: string; playerName: string; text: string }
export type CourtName = { id: string; name: string }
export type TimeOption = { value: string; label: string }
export type Hold = { id: string; courtName: string; startsAt: Date; expiresAt: Date; price: number | null }

export type NotificationKind = 'slot_held' | 'slot_free_now'
export type NotificationData = { courtName: string; startsAt: Date; expiresAt: Date | null }
export type NotificationRow = {
  id: string
  kind: NotificationKind
  data: unknown
  link: string
  created_at: string
  read_at: string | null
}
export type NotificationView = { id: string; title: string; body: string; link: string; createdAt: Date; unread: boolean }

// Postgres time comes as 'HH:MM:SS'; the screens use 'HH:MM' ('24:00:00' stays '24:00').
export function shortTime(value: string): string {
  return value.slice(0, 5)
}

export function toWait(row: WaitRow): Wait {
  return {
    id: row.id,
    date: row.on_date,
    fromTime: shortTime(row.from_time),
    toTime: shortTime(row.to_time),
    courtIds: row.court_ids,
  }
}

// "cualquier cancha", "Cancha 2", "Cancha 1 y Cancha 2", "Cancha 1, Cancha 2 y Cancha 3", in the
// club's order.
export function courtsText(courtIds: string[], courts: CourtName[]): string {
  const names = courts.filter((court) => courtIds.includes(court.id)).map((court) => court.name)
  if (names.length === 0) return 'cualquier cancha'
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

// "de 18:30 a 21:30, cualquier cancha" (the club's panel already shows the day).
export function waitRangeText(wait: Wait, courts: CourtName[]): string {
  return `de ${wait.fromTime} a ${wait.toTime}, ${courtsText(wait.courtIds, courts)}`
}

// "sáb 3, de 18:30 a 21:30, cualquier cancha" (Hoy and Mañana for the next two days).
export function waitText(wait: Wait, courts: CourtName[], today: LocalDate): string {
  return `${dayLabel(wait.date, today)}, ${waitRangeText(wait, courts)}`
}

// The player's waits as lines of text (Inicio and the wait sheet).
export function waitItems(waits: Wait[], courts: CourtName[], today: LocalDate): WaitItem[] {
  return waits.map((wait) => ({ id: wait.id, text: waitText(wait, courts, today) }))
}

// Whether a wait asks for this slot: that day, on that court (or any), starting at "Desde" or later and
// ending at "Hasta" or earlier, as create_slot_wait reads the range.
export function waitCovers(wait: Wait, date: LocalDate, courtId: string, slot: Slot): boolean {
  return (
    wait.date === date &&
    (wait.courtIds.length === 0 || wait.courtIds.includes(courtId)) &&
    slot.label >= wait.fromTime &&
    slotEndLabel(slot) <= wait.toTime
  )
}

export function slotEndLabel(slot: Slot): string {
  return formatMinutes(slot.startMinutes + Math.round((slot.endsAt.getTime() - slot.startsAt.getTime()) / 60_000))
}

// What the wait sheet offers: "Desde" any start still ahead, "Hasta" any end of those slots.
// create_slot_wait reads the range the same way: a slot fits when it starts at "Desde" or later and
// ends at "Hasta" or earlier.
export function waitRangeOptions(slots: Slot[], now: Date): { from: TimeOption[]; to: TimeOption[] } {
  const ahead = slots.filter((slot) => slot.startsAt.getTime() > now.getTime())
  return {
    from: ahead.map((slot) => ({ value: slot.label, label: slot.label })),
    to: ahead.map((slot) => {
      const end = slotEndLabel(slot)
      return { value: end, label: end }
    }),
  }
}

// "Se liberó la Cancha 2, sáb 3 a las 19:00."
export function holdText(hold: Pick<Hold, 'courtName' | 'startsAt'>, timezone: string, today: LocalDate): string {
  const day = dayLabel(localDateOf(hold.startsAt, timezone), today).toLowerCase()
  return `Se liberó la ${hold.courtName}, ${day} a las ${timeIn(hold.startsAt, timezone)}.`
}

// "12:34": minutes and seconds left, never below zero.
export function countdownText(expiresAt: Date, now: Date): string {
  const seconds = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000))
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`
}

// "sáb 3": the day without Hoy or Mañana, for a mail that may be read later.
export function shortDay(date: LocalDate): string {
  return `${WEEKDAYS_SHORT[weekdayOf(date)]} ${parseLocalDate(date).day}`
}

function readDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

// The jsonb private.offer_freed writes; anything else reads as null.
export function readNotificationData(data: unknown): NotificationData | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const record = data as Record<string, unknown>
  const startsAt = readDate(record.starts_at)
  if (typeof record.court_name !== 'string' || !startsAt) return null
  return { courtName: record.court_name, startsAt, expiresAt: readDate(record.expires_at) }
}

// The same words in /avisos and in the mail (subject and body).
export function notificationText(
  kind: NotificationKind,
  data: NotificationData,
  timezone: string,
): { title: string; body: string } {
  const time = timeIn(data.startsAt, timezone)
  if (kind === 'slot_held') {
    const until = data.expiresAt ? `hasta las ${timeIn(data.expiresAt, timezone)}` : 'unos minutos'
    return {
      title: `Se liberó tu turno: ${shortDay(localDateOf(data.startsAt, timezone))}, ${time}, ${data.courtName}`,
      body: `Te lo guardamos ${until}. Reservalo desde Inicio antes de que pase al siguiente de la lista.`,
    }
  }
  return {
    title: `Se liberó la ${data.courtName} a las ${time}: el primero que reserva se la queda`,
    body: 'Falta poco para el turno, así que no se guarda para nadie. Si lo querés, reservalo ya.',
  }
}

export function toNotificationView(row: NotificationRow, timezone: string): NotificationView | null {
  const data = readNotificationData(row.data)
  if (!data) return null
  return {
    id: row.id,
    ...notificationText(row.kind, data, timezone),
    link: row.link,
    createdAt: new Date(row.created_at),
    unread: row.read_at === null,
  }
}

// The bell's accessible name.
export function unreadLabel(count: number): string {
  if (count === 0) return 'Avisos'
  return count === 1 ? 'Avisos, 1 sin leer' : `Avisos, ${count} sin leer`
}

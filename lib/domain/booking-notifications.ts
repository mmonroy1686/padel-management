import { dayLongLabel, formatPrice, WEEKDAYS_LONG, timeIn } from './format'
import { CANCEL_REASON_TEXT, CANCEL_REASONS, type CancelReason } from './matches'
import { localDateOf } from './time'

// The avisos of a player's bookings and matches (docs/features/avisos-de-reservas/design.md). Triggers in the database
// write them (20261207000110_booking_notifications.sql); the app shows them in /avisos and mails them with these words.

export const BOOKING_NOTIFICATION_KINDS = [
  'booking_confirmed',
  'booking_series',
  'booking_reminder',
  'booking_cancelled',
  'booking_removed',
  'match_confirmed',
  'match_cancelled',
  'match_left',
  'payment_confirmed',
  'payment_rejected',
  'payment_refunded',
] as const
export type BookingNotificationKind = (typeof BOOKING_NOTIFICATION_KINDS)[number]

export function isBookingNotificationKind(kind: string): kind is BookingNotificationKind {
  return (BOOKING_NOTIFICATION_KINDS as readonly string[]).includes(kind)
}

// Who did it, as the recipient reads it.
type Actor = 'self' | 'club' | 'player' | 'system'

export type BookingNotificationData = {
  startsAt: Date | null
  courtName: string | null
  share: number | null
  actor: Actor
  actorName: string | null
  joined: boolean
  holderName: string | null
  match: boolean
  hours: number | null
  amount: number | null
  method: 'cash' | 'card' | 'transfer' | null
  reason: string | null
  note: string | null
  playerName: string | null
  free: number | null
  series: { status: 'created' | 'ended'; weekday: number; startTime: string } | null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function readBookingNotificationData(data: unknown): BookingNotificationData | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const record = data as Record<string, unknown>
  const startsAt = typeof record.starts_at === 'string' ? new Date(record.starts_at) : null
  if (startsAt && Number.isNaN(startsAt.getTime())) return null
  const actor = record.actor === 'self' || record.actor === 'club' || record.actor === 'player' ? record.actor : 'system'
  const method = record.method === 'cash' || record.method === 'card' || record.method === 'transfer' ? record.method : null
  const weekday = count(record.weekday)
  const startTime = text(record.start_time)
  const seriesStatus = record.status === 'created' || record.status === 'ended' ? record.status : null
  return {
    startsAt,
    courtName: text(record.court_name),
    share: count(record.share),
    actor,
    actorName: text(record.actor_name),
    joined: record.joined === true,
    holderName: text(record.holder_name),
    match: record.match === true,
    hours: count(record.hours),
    amount: count(record.amount),
    method,
    reason: text(record.reason),
    note: text(record.note),
    playerName: text(record.player_name),
    free: count(record.free),
    series: seriesStatus && weekday !== null && weekday >= 0 && weekday <= 6 && startTime
      ? { status: seriesStatus, weekday, startTime }
      : null,
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

// «miércoles 2 de diciembre a las 20:00».
function when(startsAt: Date, timezone: string): string {
  return `${dayLongLabel(localDateOf(startsAt, timezone))} a las ${timeIn(startsAt, timezone)}`
}

// «Miércoles 2 de diciembre a las 20:00, Cancha 2.»
function whenAndWhere(data: BookingNotificationData, timezone: string): string {
  if (!data.startsAt) return ''
  return `${capitalize(when(data.startsAt, timezone))}${data.courtName ? `, ${data.courtName}` : ''}.`
}

// «los miércoles», «los sábados».
function onWeekday(weekday: number): string {
  const name = WEEKDAYS_LONG[weekday]
  return `los ${name.endsWith('s') ? name : `${name}s`}`
}

function missing(free: number): string {
  return free === 0 ? 'Ya están los 4.' : free === 1 ? 'Falta 1.' : `Faltan ${free}.`
}

const METHOD_TEXT = { cash: 'En efectivo.', card: 'Con tarjeta.', transfer: 'Por transferencia.' } as const

function isCancelReason(value: string | null): value is CancelReason {
  return value !== null && (CANCEL_REASONS as readonly string[]).includes(value)
}

// What /avisos shows and the mail says. null when the data does not have what the text needs.
export function bookingNotificationText(
  kind: BookingNotificationKind,
  data: BookingNotificationData,
  timezone: string,
): { title: string; body: string } | null {
  const place = whenAndWhere(data, timezone)
  const court = data.courtName ?? 'la cancha'
  const name = data.actorName ?? 'Otro jugador'

  switch (kind) {
    case 'booking_confirmed': {
      if (!data.startsAt) return null
      const price = data.share !== null && data.share > 0 ? ` ${formatPrice(data.share)} por persona.` : ''
      if (data.joined) {
        const title = data.actor === 'self'
          ? `Te sumaste al turno${data.holderName ? ` de ${data.holderName}` : ''}`
          : data.actor === 'club' ? 'El club te sumó a un turno'
          : data.actor === 'player' ? `${name} te sumó a su turno`
          : 'Te sumaron a un turno'
        return { title, body: `${place}${price}` }
      }
      const title = data.actor === 'self' ? `Reservaste la ${court}`
        : data.actor === 'club' ? `El club te reservó la ${court}`
        : `Tenés reservada la ${court}`
      return { title, body: `${capitalize(when(data.startsAt, timezone))}.${price}` }
    }
    case 'booking_series': {
      if (!data.series) return null
      const days = `${onWeekday(data.series.weekday)} a las ${data.series.startTime}`
      return data.series.status === 'created'
        ? { title: `Tenés turno fijo ${days}`, body: `${court}, todas las semanas. Antes de cada turno te llega un recordatorio.` }
        : { title: `Terminó tu turno fijo de ${days}`, body: 'Ya no se reserva solo cada semana. Si querés seguir, hablá con el club.' }
    }
    case 'booking_reminder': {
      if (!data.startsAt) return null
      return {
        title: data.match ? `Tu partido es el ${when(data.startsAt, timezone)}` : `Jugás el ${when(data.startsAt, timezone)}`,
        body: `${court}. Si no podés ir, avisá cuanto antes.`,
      }
    }
    case 'booking_cancelled': {
      const title = data.actor === 'self' ? 'Cancelaste tu turno'
        : data.actor === 'club' ? 'El club canceló tu turno'
        : data.actor === 'player' ? `${name} canceló el turno`
        : 'Se canceló tu turno'
      return { title, body: place || 'La cancha quedó libre.' }
    }
    case 'booking_removed': {
      const what = data.match ? 'partido' : 'turno'
      const title = data.actor === 'club' ? `El club te sacó del ${what}`
        : data.actor === 'player' ? `${name} te sacó del ${what}`
        : `Ya no estás en el ${what}`
      return { title, body: place || 'Si es un error, hablá con el club.' }
    }
    case 'match_confirmed':
      return { title: `Partido confirmado en la ${court}`, body: `${place} Ya están los 4: la cancha está reservada.`.trim() }
    case 'match_cancelled': {
      const why = isCancelReason(data.reason) ? CANCEL_REASON_TEXT[data.reason] : ''
      const note = data.note ? ` Motivo: ${data.note}.` : ''
      const day = data.startsAt ? `${capitalize(when(data.startsAt, timezone))}. ` : ''
      return { title: 'Se canceló el partido', body: `${day}${why}${note}`.trim() }
    }
    case 'match_left': {
      if (!data.startsAt) return null
      return {
        title: `${data.playerName ?? 'Un jugador'} se bajó del partido`,
        body: `${capitalize(when(data.startsAt, timezone))}. ${missing(data.free ?? 1)}`,
      }
    }
    case 'payment_confirmed':
      if (data.amount === null) return null
      return {
        title: `Registramos tu pago de ${formatPrice(data.amount)}`,
        body: `${place} ${data.method ? METHOD_TEXT[data.method] : ''}`.trim(),
      }
    case 'payment_rejected':
      return {
        title: 'Rechazaron tu transferencia',
        body: `${place}${data.reason ? ` Motivo: ${data.reason}.` : ''} Podés volver a informarla desde la app.`.trim(),
      }
    case 'payment_refunded':
      if (data.amount === null) return null
      return { title: `Te devolvimos ${formatPrice(data.amount)}`, body: place || 'El club registró la devolución.' }
  }
}

// The mail's button and why we wrote.
export function bookingNotificationMail(kind: BookingNotificationKind, data: BookingNotificationData): { button: string; reason: string } {
  const isMatch = kind.startsWith('match_') || data.match
  const button = kind === 'booking_series' ? 'Ver mis reservas' : isMatch ? 'Ver el partido' : 'Ver el turno'
  if (kind === 'booking_reminder') {
    return { button, reason: 'te recordamos tu turno. Podés apagar los recordatorios en tu perfil.' }
  }
  if (kind.startsWith('payment_')) return { button, reason: 'te escribimos por un pago de tu reserva.' }
  if (isMatch) return { button, reason: 'te escribimos por un partido en el que estás anotado.' }
  return { button, reason: 'te escribimos por tu reserva.' }
}

// Too late to mail: what is about to happen already happened. Cancellations and payments are always worth sending.
export function isBookingNotificationStale(kind: BookingNotificationKind, data: BookingNotificationData, now: Date): boolean {
  const upcoming: readonly BookingNotificationKind[] = ['booking_confirmed', 'booking_reminder', 'match_confirmed', 'match_left']
  return upcoming.includes(kind) && (!data.startsAt || data.startsAt.getTime() <= now.getTime())
}

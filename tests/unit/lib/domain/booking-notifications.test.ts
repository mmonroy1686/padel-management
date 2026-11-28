import { describe, expect, it } from 'vitest'
import {
  bookingNotificationText,
  isBookingNotificationStale,
  readBookingNotificationData,
  type BookingNotificationKind,
} from '@/lib/domain/booking-notifications'
import { isNotificationStale, notificationContent } from '@/lib/domain/notifications'

const TZ = 'America/Montevideo'
// Wednesday 2 December 2026, 20:00 in Montevideo.
const BASE = { starts_at: '2026-12-02T23:00:00Z', court_name: 'Cancha 2', share: 400 }

function words(kind: BookingNotificationKind, data: Record<string, unknown>) {
  const read = readBookingNotificationData(data)
  expect(read).not.toBeNull()
  return bookingNotificationText(kind, read!, TZ)
}

describe('booking avisos', () => {
  it('a booking: a receipt for whoever booked, the club when reception did', () => {
    expect(words('booking_confirmed', { ...BASE, actor: 'self' })).toEqual({
      title: 'Reservaste la Cancha 2',
      body: 'Miércoles 2 de diciembre a las 20:00. $400 por persona.',
    })
    expect(words('booking_confirmed', { ...BASE, actor: 'club' })?.title).toBe('El club te reservó la Cancha 2')
    expect(words('booking_confirmed', { ...BASE, actor: 'system' })?.title).toBe('Tenés reservada la Cancha 2')
  })

  it('joining a booking: who added you', () => {
    expect(words('booking_confirmed', { ...BASE, joined: true, actor: 'self', holder_name: 'Ana' })?.title).toBe('Te sumaste al turno de Ana')
    expect(words('booking_confirmed', { ...BASE, joined: true, actor: 'player', actor_name: 'Ana' })?.title).toBe('Ana te sumó a su turno')
    expect(words('booking_confirmed', { ...BASE, joined: true, actor: 'club' })?.title).toBe('El club te sumó a un turno')
  })

  it('a weekly series: when it starts and when it ends', () => {
    const series = { court_name: 'Cancha 1', weekday: 3, start_time: '20:00', actor: 'club' }
    expect(words('booking_series', { ...series, status: 'created' })?.title).toBe('Tenés turno fijo los miércoles a las 20:00')
    expect(words('booking_series', { ...series, weekday: 6, status: 'ended' })?.title).toBe('Terminó tu turno fijo de los sábados a las 20:00')
  })

  it('the reminder', () => {
    expect(words('booking_reminder', { ...BASE, hours: 24 })).toEqual({
      title: 'Jugás el miércoles 2 de diciembre a las 20:00',
      body: 'Cancha 2. Si no podés ir, avisá cuanto antes.',
    })
    expect(words('booking_reminder', { ...BASE, match: true })?.title).toBe('Tu partido es el miércoles 2 de diciembre a las 20:00')
  })

  it('a cancellation says who did it', () => {
    expect(words('booking_cancelled', { ...BASE, actor: 'self' })).toEqual({
      title: 'Cancelaste tu turno',
      body: 'Miércoles 2 de diciembre a las 20:00, Cancha 2.',
    })
    expect(words('booking_cancelled', { ...BASE, actor: 'player', actor_name: 'Ana' })?.title).toBe('Ana canceló el turno')
    expect(words('booking_cancelled', { ...BASE, actor: 'club' })?.title).toBe('El club canceló tu turno')
    expect(words('booking_removed', { ...BASE, actor: 'club' })?.title).toBe('El club te sacó del turno')
    expect(words('booking_removed', { starts_at: BASE.starts_at, match: true, actor: 'club' })?.title).toBe('El club te sacó del partido')
  })

  it('a match: confirmed, someone left, cancelled with the reason', () => {
    expect(words('match_confirmed', BASE)?.title).toBe('Partido confirmado en la Cancha 2')
    expect(words('match_left', { starts_at: BASE.starts_at, player_name: 'Bruno', free: 1 })).toEqual({
      title: 'Bruno se bajó del partido',
      body: 'Miércoles 2 de diciembre a las 20:00. Falta 1.',
    })
    expect(words('match_cancelled', { starts_at: BASE.starts_at, reason: 'not_filled' })?.body)
      .toBe('Miércoles 2 de diciembre a las 20:00. No se completó a tiempo.')
    expect(words('match_cancelled', { starts_at: BASE.starts_at, reason: 'by_club', note: 'Lluvia' })?.body)
      .toBe('Miércoles 2 de diciembre a las 20:00. Lo canceló el club. Motivo: Lluvia.')
  })

  it('payments: paid, rejected with the reason, refunded', () => {
    expect(words('payment_confirmed', { ...BASE, amount: 400, method: 'cash' })).toEqual({
      title: 'Registramos tu pago de $400',
      body: 'Miércoles 2 de diciembre a las 20:00, Cancha 2. En efectivo.',
    })
    expect(words('payment_rejected', { ...BASE, amount: 400, method: 'transfer', reason: 'No llegó' })?.body)
      .toBe('Miércoles 2 de diciembre a las 20:00, Cancha 2. Motivo: No llegó. Podés volver a informarla desde la app.')
    expect(words('payment_refunded', { ...BASE, amount: 1600 })?.title).toBe('Te devolvimos $1.600')
  })

  it('the mail: the right button and why we wrote', () => {
    expect(notificationContent('booking_confirmed', { ...BASE, actor: 'self' }, TZ)).toMatchObject({ button: 'Ver el turno' })
    expect(notificationContent('match_confirmed', BASE, TZ)).toMatchObject({ button: 'Ver el partido' })
    expect(notificationContent('booking_reminder', BASE, TZ)?.reason).toContain('apagar los recordatorios')
    expect(notificationContent('payment_confirmed', { ...BASE }, TZ)).toBeNull()
  })

  it('what is about to happen is not mailed once it happened; cancellations and payments always are', () => {
    const after = new Date('2026-12-03T00:00:00Z')
    const read = readBookingNotificationData(BASE)!
    expect(isBookingNotificationStale('booking_reminder', read, after)).toBe(true)
    expect(isBookingNotificationStale('booking_cancelled', read, after)).toBe(false)
    expect(isNotificationStale('payment_confirmed', { ...BASE, amount: 400 }, after)).toBe(false)
    expect(isNotificationStale('booking_confirmed', { ...BASE }, new Date('2026-11-30T00:00:00Z'))).toBe(false)
  })
})

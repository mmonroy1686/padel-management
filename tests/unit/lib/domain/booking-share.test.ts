import { describe, expect, it } from 'vitest'
import { bookingJoinText, readBookingJoinData } from '@/lib/domain/booking-join-notifications'
import { bookingShareText, bookingShareUrl } from '@/lib/domain/booking-share'
import { notificationContent } from '@/lib/domain/notifications'

describe('bookingShareText', () => {
  const base = { clubName: 'Rustic Pádel', dayText: 'Sábado 30 de noviembre', time: '19:00', courtName: 'Cancha 2', url: 'https://rustic.app/turno/b1' }

  it('says how many are missing, when and where, and the link', () => {
    expect(bookingShareText({ ...base, free: 2 })).toBe(
      '🎾 Faltan 2 para jugar pádel\nSábado 30 de noviembre a las 19:00\nRustic Pádel, Cancha 2\n\nSumate acá: https://rustic.app/turno/b1',
    )
    expect(bookingShareText({ ...base, free: 1 })).toContain('Falta 1 para jugar pádel')
  })

  it('without the count, it just asks', () => {
    expect(bookingShareText({ ...base, free: null })).toContain('¿Te sumás a jugar pádel?')
  })

  it('links to the booking', () => {
    expect(bookingShareUrl('https://rustic.app', 'b1')).toBe('https://rustic.app/turno/b1')
  })
})

describe('the booking_join aviso', () => {
  const data = { joiner_name: 'Bruno', starts_at: '2026-11-30T22:00:00Z', court_name: 'Cancha 2', free: 1 }

  it('tells the holder who joined and how many are missing', () => {
    const read = readBookingJoinData(data)
    expect(read).not.toBeNull()
    expect(bookingJoinText(read!, 'America/Montevideo')).toEqual({
      title: 'Bruno se sumó a tu turno',
      body: 'lunes 30 de noviembre a las 19:00, Cancha 2. Falta 1.',
    })
    expect(notificationContent('booking_join', data, 'America/Montevideo')).toMatchObject({ button: 'Ver el turno' })
  })

  it('a broken aviso is not shown', () => {
    expect(readBookingJoinData({ joiner_name: 'Bruno' })).toBeNull()
  })
})

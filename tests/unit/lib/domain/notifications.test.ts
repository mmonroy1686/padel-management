import { describe, expect, it } from 'vitest'
import { isNotificationStale, notificationContent, toNotificationView } from '@/lib/domain/notifications'

const TIMEZONE = 'America/Montevideo'
// Saturday 2026-10-03: 22:00 UTC is 19:00 in Montevideo; 20:42 UTC is 17:42.
const HELD = { court_name: 'Cancha 2', starts_at: '2026-10-03T22:00:00Z', expires_at: '2026-10-03T20:42:00Z' }
const ADDED = {
  championship_id: 'ch1',
  championship_name: 'Campeonato de Primavera',
  category_name: '6ta Libre',
  partner_name: 'Ana',
  waiting: false,
  starts_at: '2026-10-17T11:00:00Z',
}

describe('notificationContent', () => {
  it('keeps the words of the waitlist', () => {
    expect(notificationContent('slot_held', HELD, TIMEZONE)).toEqual({
      title: 'Se liberó tu turno: sáb 3, 19:00, Cancha 2',
      body: 'Te lo guardamos hasta las 17:42. Reservalo desde Inicio antes de que pase al siguiente de la lista.',
      button: 'Reservar ahora',
      reason: 'te escribimos porque te anotaste en la lista de espera.',
    })
    expect(notificationContent('slot_free_now', HELD, TIMEZONE)?.button).toBe('Ver el turno')
  })

  it('words each aviso of a championship', () => {
    expect(notificationContent('championship_added', ADDED, TIMEZONE)).toEqual({
      title: 'Te anotaron con Ana en 6ta Libre',
      body: 'Campeonato de Primavera. Si no podés jugar, date de baja desde el campeonato.',
      button: 'Ver el campeonato',
      reason: 'te escribimos por tu inscripción en un campeonato.',
    })
    expect(notificationContent('championship_added', { ...ADDED, waiting: true }, TIMEZONE)?.body).toBe(
      'Campeonato de Primavera. Quedaron en la lista de espera: si se libera un lugar, entran solos. Si no podés jugar, date de baja desde el campeonato.',
    )
    expect(notificationContent('championship_promoted', ADDED, TIMEZONE)).toMatchObject({
      title: 'Entraste a 6ta Libre desde la lista de espera',
      body: 'Campeonato de Primavera, con Ana. Ya tienen lugar: paguen la inscripción desde el campeonato.',
    })
    expect(notificationContent('championship_moved', { ...ADDED, waiting: true }, TIMEZONE)).toMatchObject({
      title: 'Tu pareja pasó a 6ta Libre',
      body: 'Campeonato de Primavera, con Ana. El club cambió la categoría. Quedaron en la lista de espera.',
    })
    expect(notificationContent('championship_cancelled', ADDED, TIMEZONE)).toMatchObject({
      title: 'Se canceló 6ta Libre',
      body: 'Campeonato de Primavera. Si ya pagaste, el club te devuelve la plata.',
    })
    expect(notificationContent('championship_cancelled', { ...ADDED, category_name: null }, TIMEZONE)).toMatchObject({
      title: 'Se canceló Campeonato de Primavera',
      body: 'Si ya pagaste, el club te devuelve la plata.',
    })
  })

  it('reads nothing it does not understand', () => {
    expect(notificationContent('championship_added', { category_name: '6ta' }, TIMEZONE)).toBeNull()
    expect(notificationContent('slot_held', ADDED, TIMEZONE)).toBeNull()
    expect(notificationContent('championship_added', null, TIMEZONE)).toBeNull()
  })
})

describe('isNotificationStale', () => {
  it('drops a hold that ran out and a championship that already started', () => {
    expect(isNotificationStale('slot_held', HELD, new Date('2026-10-03T20:41:00Z'))).toBe(false)
    expect(isNotificationStale('slot_held', HELD, new Date('2026-10-03T20:42:00Z'))).toBe(true)
    expect(isNotificationStale('championship_added', ADDED, new Date('2026-10-10T12:00:00Z'))).toBe(false)
    expect(isNotificationStale('championship_added', ADDED, new Date('2026-10-17T11:00:00Z'))).toBe(true)
    expect(isNotificationStale('championship_cancelled', { ...ADDED, starts_at: null }, new Date())).toBe(false)
    expect(isNotificationStale('championship_added', {}, new Date())).toBe(true)
  })
})

describe('toNotificationView', () => {
  it('turns a row into what /avisos shows', () => {
    const row = { id: 'n1', kind: 'slot_held' as const, data: HELD, link: '/', created_at: '2026-10-03T20:27:00Z', read_at: null }
    expect(toNotificationView(row, TIMEZONE)).toEqual({
      id: 'n1',
      title: 'Se liberó tu turno: sáb 3, 19:00, Cancha 2',
      body: 'Te lo guardamos hasta las 17:42. Reservalo desde Inicio antes de que pase al siguiente de la lista.',
      link: '/',
      createdAt: new Date('2026-10-03T20:27:00Z'),
      unread: true,
    })
    expect(toNotificationView({ ...row, read_at: '2026-10-03T20:30:00Z' }, TIMEZONE)?.unread).toBe(false)
    expect(toNotificationView({ ...row, data: {} }, TIMEZONE)).toBeNull()
    const championship = { ...row, kind: 'championship_added' as const, data: ADDED, link: '/campeonatos/ch1' }
    expect(toNotificationView(championship, TIMEZONE)?.title).toBe('Te anotaron con Ana en 6ta Libre')
  })
})

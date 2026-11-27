import { describe, expect, it } from 'vitest'
import { notificationContent, isNotificationStale } from '@/lib/domain/notifications'

const DATA = { tournament_id: 't1', tournament_name: 'Americano del jueves', partner_name: 'Bruno', event: 'added', starts_at: '2026-12-10T21:00:00Z' }

describe('the tournament pair aviso', () => {
  it('says who signed her up', () => {
    expect(notificationContent('tournament_pair', DATA, 'America/Montevideo')).toMatchObject({
      title: 'Bruno te anotó como pareja en Americano del jueves',
      button: 'Ver el torneo',
    })
  })

  it('when the club paired her, and when her partner left', () => {
    expect(notificationContent('tournament_pair', { ...DATA, event: 'paired' }, 'America/Montevideo')?.title).toBe(
      'Ya tenés pareja en Americano del jueves: Bruno',
    )
    expect(notificationContent('tournament_pair', { ...DATA, event: 'left' }, 'America/Montevideo')?.body).toMatch(/buscando pareja/)
  })

  it('reads nothing it does not understand, and goes stale at the start', () => {
    expect(notificationContent('tournament_pair', { ...DATA, event: 'otro' }, 'America/Montevideo')).toBeNull()
    expect(isNotificationStale('tournament_pair', DATA, new Date('2026-12-10T22:00:00Z'))).toBe(true)
    expect(isNotificationStale('tournament_pair', DATA, new Date('2026-12-09T22:00:00Z'))).toBe(false)
  })
})

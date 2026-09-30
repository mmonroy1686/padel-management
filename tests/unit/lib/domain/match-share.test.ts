import { describe, expect, it } from 'vitest'
import { makeMatch, withPlayers } from '../../fixtures/matches'
import { shareText, whatsappUrl } from '@/lib/domain/match-share'

describe('shareText', () => {
  it('writes the message for the club WhatsApp group', () => {
    const match = withPlayers(makeMatch(), ['ana', 'b', 'c', null])
    expect(
      shareText({ match, clubName: 'Rustic Pádel', dayText: 'jueves 1 de octubre', time: '20:00', url: 'https://x.uy/partidos/m1' }),
    ).toBe(
      [
        '🎾 Falta 1 para el jueves 1 de octubre a las 20:00',
        'Rustic Pádel, Cancha 1',
        'Categoría 4ª a 6ª, mixto',
        'Falta: revés',
        '$400 por persona',
        '',
        'Sumate acá: https://x.uy/partidos/m1',
      ].join('\n'),
    )
  })

  it('counts every missing spot', () => {
    const text = shareText({ match: makeMatch(), clubName: 'Rustic', dayText: 'jueves 1 de octubre', time: '20:00', url: 'u' })
    expect(text).toContain('Faltan 3 para')
    expect(text).toContain('Falta: revés, drive, revés')
  })
})

describe('whatsappUrl', () => {
  it('opens WhatsApp with the message', () => {
    expect(whatsappUrl('Hola, ¿jugás?')).toBe('https://wa.me/?text=Hola%2C%20%C2%BFjug%C3%A1s%3F')
  })
})

import { describe, expect, it } from 'vitest'
import { tournamentShareText } from '@/lib/domain/tournament-share'
import { makeEntries, makeTournament } from '../../fixtures/tournaments'

const input = { clubName: 'Rustic Pádel', dayText: 'jueves 1 de octubre', timeText: '18:00 a 20:20', url: 'https://app.test/torneos/t1' }

describe('tournamentShareText', () => {
  it('says what, when, where, for whom, how many spots are left and how much', () => {
    expect(tournamentShareText({ ...input, tournament: makeTournament() })).toBe(
      [
        '🏆 Americano de octubre',
        'jueves 1 de octubre, 18:00 a 20:20',
        'Rustic Pádel, Cancha 1 y Cancha 2',
        'Categoría 4ª a 6ª, mixto',
        'Quedan 3 lugares (5 de 8)',
        '$400 por persona',
        '',
        'Anotate acá: https://app.test/torneos/t1',
      ].join('\n'),
    )
  })

  it('handles the last spot, a full tournament and a free one', () => {
    expect(tournamentShareText({ ...input, tournament: makeTournament({ entries: makeEntries(7) }) })).toContain('Queda 1 lugar (7 de 8)')
    const full = tournamentShareText({ ...input, tournament: makeTournament({ entries: makeEntries(8), price: 0 }) })
    expect(full).toContain('Cupo completo')
    expect(full).not.toContain('por persona')
  })
})

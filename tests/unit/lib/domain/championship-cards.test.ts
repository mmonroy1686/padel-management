import { describe, expect, it } from 'vitest'
import { AVATAR_TONES, avatarTone, matchShareText, pairInitials, phaseGroups } from '@/lib/domain/championship-cards'
import type { MatchView } from '@/lib/domain/championship-views'

function view(overrides: Partial<MatchView>): MatchView {
  return {
    id: 'm1',
    categoryId: 'c1',
    categoryName: '6ta',
    name: 'Zona A',
    stage: 'group',
    groupId: 'g1',
    round: null,
    position: null,
    sideA: 'Ana Pérez y Pedro Gómez',
    sideB: 'Lucía Díaz y Juan Ruiz',
    entryA: 'e1',
    entryB: 'e2',
    startsAt: new Date('2026-10-10T12:00:00Z'),
    date: '2026-10-10',
    day: 'sáb 10',
    time: '09:00',
    court: 'Cancha 1',
    status: 'scheduled',
    statusLabel: 'Programado',
    score: null,
    winner: null,
    sets: [],
    pinned: false,
    ready: true,
    ...overrides,
  }
}

describe('pairInitials', () => {
  it('takes the first letter of each player', () => {
    expect(pairInitials('Ana Pérez y Pedro Gómez')).toBe('AP')
    expect(pairInitials('Álvaro y beto')).toBe('ÁB')
  })
})

describe('avatarTone', () => {
  it('gives a pair always the same tone from the palette', () => {
    expect(avatarTone('Ana Pérez y Pedro Gómez')).toBe(avatarTone('Ana Pérez y Pedro Gómez'))
    expect(AVATAR_TONES).toContain(avatarTone('Lucía Díaz y Juan Ruiz'))
  })
})

describe('phaseGroups', () => {
  it('lists the zones first, then the knockout from the first round to the final, by start inside', () => {
    const groups = phaseGroups([
      view({ id: 'f', stage: 'knockout', name: 'Final', round: 1, position: 1, groupId: null }),
      view({ id: 'b2', name: 'Zona B', groupId: 'g2', startsAt: new Date('2026-10-10T15:00:00Z') }),
      view({ id: 'a2', name: 'Zona A', startsAt: new Date('2026-10-10T14:00:00Z') }),
      view({ id: 's1', stage: 'knockout', name: 'Semifinal 1', round: 2, position: 1, groupId: null }),
      view({ id: 'a1', name: 'Zona A', startsAt: new Date('2026-10-10T12:00:00Z') }),
      view({ id: 's2', stage: 'knockout', name: 'Semifinal 2', round: 2, position: 2, groupId: null }),
    ])
    expect(groups.map((group) => [group.title, group.matches.map((match) => match.id)])).toEqual([
      ['Zona A', ['a1', 'a2']],
      ['Zona B', ['b2']],
      ['Semifinal', ['s1', 's2']],
      ['Final', ['f']],
    ])
  })
})

describe('matchShareText', () => {
  const where = { championshipName: 'Copa de Verano', url: 'https://club.uy/c/copa' }

  it('tells the result of a played match', () => {
    const played = view({
      status: 'finished',
      winner: 'b',
      sets: [
        { a: 4, b: 6, superTiebreak: false, inProgress: false },
        { a: 3, b: 6, superTiebreak: false, inProgress: false },
      ],
    })
    expect(matchShareText(played, where)).toBe(
      'Lucía Díaz y Juan Ruiz ganaron 6-4 6-3 a Ana Pérez y Pedro Gómez · Zona A · Copa de Verano\nhttps://club.uy/c/copa',
    )
  })

  it('tells when and where before it is played', () => {
    expect(matchShareText(view({}), where)).toBe(
      'Ana Pérez y Pedro Gómez vs Lucía Díaz y Juan Ruiz · sáb 10 09:00 · Cancha 1 · Zona A · Copa de Verano\nhttps://club.uy/c/copa',
    )
  })

  it('says a walkover as such', () => {
    expect(matchShareText(view({ status: 'walkover', winner: 'a' }), where)).toBe(
      'Ana Pérez y Pedro Gómez ganaron por W.O. a Lucía Díaz y Juan Ruiz · Zona A · Copa de Verano\nhttps://club.uy/c/copa',
    )
  })
})

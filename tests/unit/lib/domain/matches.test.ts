import { describe, expect, it } from 'vitest'
import { at, RULES, TIMEZONE } from '../../fixtures/grid'
import { makeMatch, withPlayers } from '../../fixtures/matches'
import {
  categoryRangeLabel,
  defaultCategoryRange,
  howItWorks,
  joinResultMessage,
  leaveStatus,
  matchFormDefaults,
  missingText,
  perPlayerPrice,
  statusLabel,
  toMatch,
  type MatchRow,
} from '@/lib/domain/matches'

const ROW: MatchRow = {
  id: 'm1',
  starts_at: at('20:00').toISOString(),
  ends_at: at('21:30').toISOString(),
  preferred_court_id: 'court-1',
  court_id: null,
  allow_other_court: true,
  category_min: 4,
  category_max: 6,
  match_type: 'mixed',
  status: 'forming',
  cancel_reason: null,
  booking_id: null,
  booking: null,
  slots: [
    { position: 2, side: 'backhand', player_id: 'priv', player: null },
    { position: 1, side: 'drive', player_id: 'ana', player: { display_name: 'Ana Pérez' } },
    { position: 4, side: 'backhand', player_id: null, player: null },
    { position: 3, side: 'drive', player_id: null, player: null },
  ],
}
const LOOKUPS = { courtNames: new Map([['court-1', 'Cancha 1'], ['court-2', 'Cancha 2']]), rules: RULES, timezone: TIMEZONE }

describe('toMatch', () => {
  it('reads a match row with its spots in order and the estimated price', () => {
    const match = toMatch(ROW, LOOKUPS)
    expect(match).toMatchObject({ preferredCourtName: 'Cancha 1', courtName: null, price: 1600, type: 'mixed' })
    expect(match.slots.map((slot) => [slot.position, slot.playerName])).toEqual([
      [1, 'Ana Pérez'],
      [2, 'Jugador'],
      [3, null],
      [4, null],
    ])
  })

  it('uses the frozen price and the booked court once confirmed', () => {
    const match = toMatch({ ...ROW, status: 'confirmed', court_id: 'court-2', booking: { price: 1500 } }, LOOKUPS)
    expect(match).toMatchObject({ status: 'confirmed', courtName: 'Cancha 2', price: 1500 })
  })

  it('ignores cancel reasons it does not know', () => {
    expect(toMatch({ ...ROW, status: 'cancelled', cancel_reason: 'boom' }, LOOKUPS).cancelReason).toBeNull()
    expect(toMatch({ ...ROW, status: 'cancelled', cancel_reason: 'no_court' }, LOOKUPS).cancelReason).toBe('no_court')
  })
})

describe('missingText', () => {
  it('says what is missing in words', () => {
    expect(missingText(withPlayers(makeMatch(), ['a', 'b', 'c', null]))).toBe('Falta 1 de revés')
    expect(missingText(withPlayers(makeMatch(), ['a', null, 'c', null]))).toBe('Faltan 2 de revés')
    expect(missingText(makeMatch())).toBe('Faltan 3: 1 de drive y 2 de revés')
    expect(missingText(withPlayers(makeMatch(), ['a', 'b', 'c', 'd']))).toBe('Completo')
  })
})

describe('labels', () => {
  it('names category ranges', () => {
    expect(categoryRangeLabel(4, 6)).toBe('4ª a 6ª')
    expect(categoryRangeLabel(5, 5)).toBe('5ª')
  })

  it('names the state of a match', () => {
    expect(statusLabel(makeMatch())).toBe('Armándose, 1 de 4')
    expect(statusLabel(makeMatch({ status: 'confirmed', courtName: 'Cancha 2' }))).toBe('Confirmado, Cancha 2')
    expect(statusLabel(makeMatch({ status: 'cancelled' }))).toBe('Cancelado')
  })

  it('splits the price among four', () => {
    expect(perPlayerPrice(1600)).toBe(400)
    expect(perPlayerPrice(1602)).toBe(400)
  })

  it('suggests the player category plus and minus one', () => {
    expect(defaultCategoryRange(5)).toEqual({ min: 4, max: 6 })
    expect(defaultCategoryRange(1)).toEqual({ min: 1, max: 2 })
    expect(defaultCategoryRange(null)).toEqual({ min: 1, max: 8 })
  })

  it('proposes the player category range, gender and side for a new match', () => {
    expect(matchFormDefaults({ id: 'x', category: 5, gender: 'female', side: 'both' })).toEqual({
      categoryMin: 4,
      categoryMax: 6,
      type: 'female',
      side: 'drive',
    })
    expect(matchFormDefaults({ id: 'x', category: null, gender: null, side: 'backhand' })).toMatchObject({
      type: 'mixed',
      side: 'backhand',
    })
  })

  it('explains how open matches work with the club numbers', () => {
    expect(howItWorks(3, 24)).toBe(
      'La cancha se reserva recién cuando están los 4. Si 3 h antes no se completó, el partido se cancela solo y no pagás nada. Cada jugador paga su parte. Para bajarte de un partido confirmado, avisá con 24 h de anticipación.',
    )
  })
})

describe('leaveStatus', () => {
  const now = at('08:00')

  it('lets a player leave a forming match whenever', () => {
    expect(leaveStatus(makeMatch(), 'ana', 24, now)).toEqual({ allowed: true })
  })

  it('asks for the notice period in a confirmed match', () => {
    const confirmed = makeMatch({ status: 'confirmed' })
    expect(leaveStatus(confirmed, 'ana', 6, now)).toEqual({ allowed: true })
    expect(leaveStatus(confirmed, 'ana', 24, now)).toEqual({
      allowed: false,
      reason: 'Ya no podés bajarte: faltan menos de 24 h. Avisá al club.',
    })
  })

  it('is nothing for someone who is not in the match or a cancelled one', () => {
    expect(leaveStatus(makeMatch(), 'bruno', 24, now)).toBeNull()
    expect(leaveStatus(makeMatch({ status: 'cancelled' }), 'ana', 24, now)).toBeNull()
  })
})

describe('joinResultMessage', () => {
  it('tells the fourth player what happened', () => {
    expect(joinResultMessage({ status: 'confirmed', cancelReason: null }, 'Cancha 2')).toBe(
      'Partido confirmado en la Cancha 2.',
    )
    expect(joinResultMessage({ status: 'cancelled', cancelReason: 'no_court' }, null)).toBe(
      'El partido se canceló. Se completaron los 4, pero no quedaba ninguna cancha libre a esa hora.',
    )
    expect(joinResultMessage({ status: 'forming', cancelReason: null }, null)).toBe('Te sumaste al partido.')
  })
})

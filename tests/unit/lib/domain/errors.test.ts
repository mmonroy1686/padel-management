import { describe, expect, it } from 'vitest'
import { errorMessage, FALLBACK_MESSAGE, isErrorCode } from '@/lib/domain/errors'

// Every code the database functions raise (supabase/migrations/*.sql).
const DATABASE_CODES = [
  'slot_taken', 'not_aligned', 'in_the_past', 'outside_window', 'notice_period', 'no_price',
  'too_many_bookings', 'busy_at_that_time', 'receipt_required', 'forbidden', 'not_found',
  'invalid_state', 'invalid_input', 'method_disabled',
  'category_mismatch', 'type_mismatch', 'side_mismatch', 'match_closed', 'already_in_match', 'spot_taken',
  'already_paid', 'court_has_history',
  'tournament_closed', 'tournament_full', 'already_in_tournament', 'not_enough_players', 'scores_missing',
  'invalid_score', 'courts_busy', 'outside_hours',
]

describe('errorMessage', () => {
  it.each(DATABASE_CODES)('translates %s', (code) => {
    expect(isErrorCode(code)).toBe(true)
    expect(errorMessage(code)).not.toBe(FALLBACK_MESSAGE)
  })

  it('tells the player the court was just taken', () => {
    expect(errorMessage('slot_taken')).toBe('Esa cancha se acaba de ocupar. Elegí otro horario.')
  })

  it('explains the match rules in words', () => {
    expect(errorMessage('side_mismatch')).toBe('Ese lugar es para el otro lado de la cancha.')
    expect(errorMessage('busy_at_that_time')).toBe('Ya tenés una reserva, un partido o un torneo a esa hora.')
  })

  it('explains the tournament rules in words', () => {
    expect(errorMessage('not_enough_players')).toBe('Para armar el fixture tiene que haber 8, 12 o 16 anotados.')
    expect(errorMessage('courts_busy')).toBe('Alguna de esas canchas ya está ocupada en ese horario. Elegí otras u otro horario.')
  })

  it('falls back for unknown codes and inherited object keys', () => {
    expect(errorMessage('boom')).toBe(FALLBACK_MESSAGE)
    expect(errorMessage('constructor')).toBe(FALLBACK_MESSAGE)
    expect(errorMessage(undefined)).toBe(FALLBACK_MESSAGE)
  })
})

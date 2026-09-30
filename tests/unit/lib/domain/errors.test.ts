import { describe, expect, it } from 'vitest'
import { errorMessage, FALLBACK_MESSAGE, isErrorCode } from '@/lib/domain/errors'

// Every code the database functions raise (supabase/migrations/*.sql).
const DATABASE_CODES = [
  'slot_taken', 'not_aligned', 'in_the_past', 'outside_window', 'notice_period', 'no_price',
  'too_many_bookings', 'busy_at_that_time', 'receipt_required', 'forbidden', 'not_found',
  'invalid_state', 'invalid_input', 'method_disabled',
  'category_mismatch', 'type_mismatch', 'side_mismatch', 'match_closed', 'already_in_match', 'spot_taken',
  'already_paid', 'court_has_history',
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
    expect(errorMessage('busy_at_that_time')).toBe('Ya tenés una reserva o un partido a esa hora.')
  })

  it('falls back for unknown codes and inherited object keys', () => {
    expect(errorMessage('boom')).toBe(FALLBACK_MESSAGE)
    expect(errorMessage('constructor')).toBe(FALLBACK_MESSAGE)
    expect(errorMessage(undefined)).toBe(FALLBACK_MESSAGE)
  })
})

import { describe, expect, it } from 'vitest'
import { errorMessage, FALLBACK_MESSAGE, isErrorCode } from '@/lib/domain/errors'

// Every code the database functions raise (supabase/migrations/20260929000*.sql).
const DATABASE_CODES = [
  'slot_taken', 'not_aligned', 'in_the_past', 'outside_window', 'notice_period', 'no_price',
  'too_many_bookings', 'busy_at_that_time', 'receipt_required', 'forbidden', 'not_found',
  'invalid_state', 'invalid_input', 'method_disabled',
]

describe('errorMessage', () => {
  it.each(DATABASE_CODES)('translates %s', (code) => {
    expect(isErrorCode(code)).toBe(true)
    expect(errorMessage(code)).not.toBe(FALLBACK_MESSAGE)
  })

  it('tells the player the court was just taken', () => {
    expect(errorMessage('slot_taken')).toBe('Esa cancha se acaba de ocupar. Elegí otro horario.')
  })

  it('falls back for unknown codes and inherited object keys', () => {
    expect(errorMessage('boom')).toBe(FALLBACK_MESSAGE)
    expect(errorMessage('constructor')).toBe(FALLBACK_MESSAGE)
    expect(errorMessage(undefined)).toBe(FALLBACK_MESSAGE)
  })
})

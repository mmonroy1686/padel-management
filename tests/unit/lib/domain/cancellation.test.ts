import { describe, expect, it } from 'vitest'
import { cancellationRule, cancellationStatus } from '@/lib/domain/cancellation'

const now = new Date('2026-10-01T12:00:00Z')
const hoursFromNow = (hours: number) => new Date(now.getTime() + hours * 3_600_000)

describe('cancellationStatus', () => {
  it('allows cancelling with enough notice', () => {
    expect(cancellationStatus(hoursFromNow(30), 24, now)).toEqual({ allowed: true })
  })

  it('allows it exactly at the limit, like the database', () => {
    expect(cancellationStatus(hoursFromNow(24), 24, now)).toEqual({ allowed: true })
  })

  it('explains why inside the notice period', () => {
    expect(cancellationStatus(hoursFromNow(2), 24, now)).toEqual({
      allowed: false,
      reason: 'Ya no se puede cancelar: faltan menos de 24 h. Avisá al club.',
    })
  })

  it('explains why once the slot started', () => {
    expect(cancellationStatus(hoursFromNow(-1), 24, now)).toEqual({ allowed: false, reason: 'Este turno ya empezó.' })
  })
})

describe('cancellationRule', () => {
  it('states the rule before booking', () => {
    expect(cancellationRule(24)).toBe('Podés cancelar desde la app hasta 24 h antes. Después, avisá al club.')
    expect(cancellationRule(0)).toBe('Podés cancelar desde la app hasta que empiece el turno.')
  })
})

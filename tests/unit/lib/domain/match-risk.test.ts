import { describe, expect, it } from 'vitest'
import { at } from '../../fixtures/grid'
import { makeMatch } from '../../fixtures/matches'
import { freeCourtIds, riskOf } from '@/lib/domain/match-risk'

describe('freeCourtIds', () => {
  it('keeps the courts with nothing overlapping the slot', () => {
    const taken = [{ courtId: 'court-1', startsAt: at('19:00'), endsAt: at('20:30') }]
    expect(freeCourtIds(['court-1', 'court-2'], taken, { startsAt: at('20:00'), endsAt: at('21:30') })).toEqual(['court-2'])
    expect(freeCourtIds(['court-1', 'court-2'], taken, { startsAt: at('20:30'), endsAt: at('22:00') })).toEqual(['court-1', 'court-2'])
  })
})

describe('riskOf', () => {
  it('is nothing while the preferred court is free', () => {
    expect(riskOf(makeMatch(), ['court-1', 'court-2'])).toBeNull()
  })

  it('warns when the preferred court was taken but another one is left', () => {
    expect(riskOf(makeMatch(), ['court-2'])).toEqual({
      level: 'warn',
      text: 'La Cancha 1 ya se reservó. Si el partido se completa, se asigna otra cancha libre (queda 1).',
    })
  })

  it('says the match falls through when no court is left for it', () => {
    expect(riskOf(makeMatch(), [])).toEqual({
      level: 'bad',
      text: 'No quedan canchas libres a esa hora. Si nadie libera una, el partido se cae.',
    })
    expect(riskOf(makeMatch({ allowOtherCourt: false }), ['court-2'])).toEqual({
      level: 'bad',
      text: 'La Cancha 1 ya se reservó y el partido no acepta otra cancha. Si nadie la libera, el partido se cae.',
    })
  })

  it('is nothing for a match that holds its court or is no longer forming', () => {
    expect(riskOf(makeMatch({ bookingId: 'b1' }), [])).toBeNull()
    expect(riskOf(makeMatch({ status: 'confirmed' }), [])).toBeNull()
  })
})

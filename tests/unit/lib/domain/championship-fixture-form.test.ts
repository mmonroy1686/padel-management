import { describe, expect, it } from 'vitest'
import { readGroupOrderForm, readResultForm, readSeedsForm, readSlotForm } from '@/lib/domain/championship-fixture-form'

const CATEGORY = '22222222-2222-2222-2222-222222222222'
const MATCH = '33333333-3333-3333-3333-333333333333'
const COURT = '44444444-4444-4444-4444-444444444444'
const E1 = '55555555-5555-5555-5555-555555555551'
const E2 = '55555555-5555-5555-5555-555555555552'
const E3 = '55555555-5555-5555-5555-555555555553'

function form(entries: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) data.append(key, value)
  return data
}

describe('readSeedsForm', () => {
  it('reads the seeds in order and skips the pairs without one', () => {
    expect(readSeedsForm(form({ categoryId: CATEGORY, [`seed:${E1}`]: '2', [`seed:${E2}`]: '', [`seed:${E3}`]: '1' }))).toEqual({
      ok: true,
      value: { categoryId: CATEGORY, entryIds: [E3, E1] },
    })
  })

  it('does not take two pairs with the same number', () => {
    expect(readSeedsForm(form({ categoryId: CATEGORY, [`seed:${E1}`]: '1', [`seed:${E2}`]: '1' }))).toEqual({
      ok: false,
      message: 'Dos parejas tienen el mismo número de cabeza de serie.',
    })
  })
})

describe('readResultForm', () => {
  it('reads two or three sets', () => {
    expect(readResultForm(form({ matchId: MATCH, a1: '6', b1: '4', a2: '3', b2: '6', a3: '10', b3: '8' }))).toEqual({
      ok: true,
      value: { matchId: MATCH, sets: [[6, 4], [3, 6], [10, 8]] },
    })
    expect(readResultForm(form({ matchId: MATCH, a1: '6', b1: '2', a2: '6', b2: '1', a3: '', b3: '' }))).toEqual({
      ok: true,
      value: { matchId: MATCH, sets: [[6, 2], [6, 1]] },
    })
  })

  it('says what is missing', () => {
    expect(readResultForm(form({ matchId: MATCH, a1: '6', b1: '' }))).toEqual({
      ok: false,
      message: 'Completá los dos números del set 1.',
    })
    expect(readResultForm(form({ matchId: MATCH, a1: '6', b1: '4', a2: '', b2: '', a3: '6', b3: '2' }))).toEqual({
      ok: false,
      message: 'Cargá el set 2 antes que el 3.',
    })
    expect(readResultForm(form({ matchId: MATCH }))).toEqual({ ok: false, message: 'Cargá al menos un set.' })
    expect(readResultForm(form({ matchId: MATCH, a1: 'seis', b1: '4' }))).toEqual({
      ok: false,
      message: 'Los games son números de 0 a 99.',
    })
  })
})

describe('readSlotForm', () => {
  it('reads the court and the start chosen together', () => {
    expect(readSlotForm(form({ matchId: MATCH, slot: `${COURT}|2026-10-17T11:00:00.000Z` }))).toEqual({
      ok: true,
      value: { matchId: MATCH, courtId: COURT, startsAt: '2026-10-17T11:00:00.000Z' },
    })
    expect(readSlotForm(form({ matchId: MATCH, slot: 'cualquiera' }))).toEqual({
      ok: false,
      message: 'Elegí una cancha y un horario.',
    })
  })
})

describe('readGroupOrderForm', () => {
  it('reads one place per pair, from the 1st on', () => {
    expect(readGroupOrderForm(form({ groupId: CATEGORY, [`place:${E1}`]: '2', [`place:${E2}`]: '1' }))).toEqual({
      ok: true,
      value: { groupId: CATEGORY, entryIds: [E2, E1] },
    })
    expect(readGroupOrderForm(form({ groupId: CATEGORY, [`place:${E1}`]: '1', [`place:${E2}`]: '1' }))).toEqual({
      ok: false,
      message: 'Cada pareja va en un puesto distinto, del 1 en adelante.',
    })
  })
})

import { describe, expect, it } from 'vitest'
import { checkResult, setDone, setPartial, walkoverSets, type MatchRules } from '@/lib/domain/championship-results'

const SUPER: MatchRules = { thirdSet: 'super_tiebreak', timeLimit: null }
const FULL: MatchRules = { thirdSet: 'full', timeLimit: null }
const LIMIT: MatchRules = { thirdSet: 'super_tiebreak', timeLimit: 50 }

describe('sets', () => {
  it('ends a set 6-0 to 6-4, 7-5 or 7-6', () => {
    expect(setDone(6, 4, false)).toBe(true)
    expect(setDone(7, 5, false)).toBe(true)
    expect(setDone(6, 7, false)).toBe(true)
    expect(setDone(6, 5, false)).toBe(false)
    expect(setDone(7, 4, false)).toBe(false)
  })

  it('ends a super tie-break at 10 by 2', () => {
    expect(setDone(10, 8, true)).toBe(true)
    expect(setDone(12, 10, true)).toBe(true)
    expect(setDone(10, 9, true)).toBe(false)
    expect(setDone(12, 9, true)).toBe(false)
  })

  it('knows a set the time cut', () => {
    expect(setPartial(6, 5, false)).toBe(true)
    expect(setPartial(3, 3, false)).toBe(true)
    expect(setPartial(6, 4, false)).toBe(false)
    expect(setPartial(9, 8, true)).toBe(true)
    expect(setPartial(12, 9, true)).toBe(false)
  })
})

describe('checkResult', () => {
  it('rejects 6-5 and a tie-break without 2 of difference', () => {
    expect(checkResult([[6, 5], [6, 4]], SUPER)).toEqual({
      ok: false,
      message: 'El set 1 no es un resultado posible: termina 6-0 a 6-4, 7-5 o 7-6.',
    })
    expect(checkResult([[6, 4], [3, 6], [10, 9]], SUPER)).toEqual({
      ok: false,
      message: 'El súper tie-break termina a 10 con 2 de diferencia (10-8, 11-9…).',
    })
  })

  it('accepts a match won in the super tie-break, or in a full third set', () => {
    expect(checkResult([[6, 4], [3, 6], [10, 8]], SUPER)).toEqual({ ok: true, winner: 'a' })
    expect(checkResult([[4, 6], [6, 3], [5, 7]], FULL)).toEqual({ ok: true, winner: 'b' })
    expect(checkResult([[6, 2], [6, 1]], SUPER)).toEqual({ ok: true, winner: 'a' })
  })

  it('needs somebody to win 2 sets without a time limit, and no set after that', () => {
    expect(checkResult([[6, 4], [3, 6]], SUPER)).toEqual({
      ok: false,
      message: 'Falta terminar el partido: alguien tiene que ganar 2 sets.',
    })
    expect(checkResult([[6, 4], [6, 3], [6, 2]], SUPER)).toEqual({
      ok: false,
      message: 'Sobra un set: el partido ya estaba ganado.',
    })
    expect(checkResult([], SUPER)).toEqual({ ok: false, message: 'Cargá al menos un set.' })
  })

  it('takes the score as it was when the time ran out: sets first, then games', () => {
    expect(checkResult([[6, 4], [3, 3]], LIMIT)).toEqual({ ok: true, winner: 'a' })
    expect(checkResult([[4, 5]], LIMIT)).toEqual({ ok: true, winner: 'b' })
    expect(checkResult([[6, 2], [4, 6], [5, 3]], LIMIT)).toEqual({ ok: true, winner: 'a' })
    expect(checkResult([[4, 4]], LIMIT)).toEqual({
      ok: false,
      message: 'Empate: con límite de tiempo gana quien va arriba en sets y después en games.',
    })
  })

  it('counts a W.O. as 6-0 6-0', () => {
    expect(walkoverSets('a')).toEqual([[6, 0], [6, 0]])
    expect(walkoverSets('b')).toEqual([[0, 6], [0, 6]])
  })
})

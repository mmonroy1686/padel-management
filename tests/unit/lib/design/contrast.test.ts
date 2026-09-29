import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@/lib/design/contrast'

describe('contrastRatio', () => {
  it('returns 21 for black on white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
  })

  it('gives the same result in both directions', () => {
    expect(contrastRatio('#FCB021', '#021716')).toBeCloseTo(contrastRatio('#021716', '#FCB021'), 10)
  })

  it('matches the Rustic pairs measured in the general plan', () => {
    expect(contrastRatio('#000000', '#FCB021')).toBeCloseTo(11.4, 0)
    expect(contrastRatio('#FFFFFF', '#021716')).toBeCloseTo(18.5, 0)
    expect(contrastRatio('#8A5A00', '#FFFFFF')).toBeCloseTo(5.9, 0)
  })

  it('accepts shorthand hex', () => {
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 5)
  })

  it('rejects values that are not hex colors', () => {
    expect(() => contrastRatio('red', '#000')).toThrow(/hex/)
  })
})

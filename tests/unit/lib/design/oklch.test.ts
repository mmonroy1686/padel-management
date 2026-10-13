import { describe, expect, it } from 'vitest'
import { hexToOklch, oklchToHex } from '@/lib/design/oklch'

describe('OKLCH', () => {
  it('puts black at 0 and white at 1 of lightness, both without chroma', () => {
    expect(hexToOklch('#000000').l).toBeCloseTo(0, 6)
    expect(hexToOklch('#FFFFFF').l).toBeCloseTo(1, 6)
    expect(hexToOklch('#FFFFFF').c).toBeCloseTo(0, 6)
  })

  it('gives back every 8-bit color it was given', () => {
    for (let r = 0; r < 256; r += 15) {
      for (let g = 0; g < 256; g += 15) {
        for (let b = 0; b < 256; b += 15) {
          const hex = `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()}`
          expect(oklchToHex(hexToOklch(hex))).toBe(hex)
        }
      }
    }
  })

  it('clips what falls outside the screen colors instead of breaking', () => {
    expect(oklchToHex({ l: 1.2, c: 0, h: 0 })).toBe('#FFFFFF')
    expect(oklchToHex({ l: 0.7, c: 0.4, h: 30 })).toMatch(/^#[0-9A-F]{6}$/)
  })

  it('accepts lower case and rejects what is not #RRGGBB', () => {
    expect(oklchToHex(hexToOklch('#fcb021'))).toBe('#FCB021')
    expect(() => hexToOklch('#FFF')).toThrow(/RRGGBB/)
    expect(() => hexToOklch('rojo')).toThrow(/RRGGBB/)
  })
})

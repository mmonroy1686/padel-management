import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@/lib/design/contrast'

type Theme = Record<string, string>

function readThemes(): { dark: Theme; light: Theme } {
  const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')
  const blocks = [...css.matchAll(/:root\s*\{([^}]*)\}/g)].map((match) => match[1])
  expect(blocks, 'globals.css needs a dark :root and a light :root inside the media query').toHaveLength(2)

  const parse = (block: string): Theme =>
    Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g)].map((m) => [m[1], m[2]]))

  return { dark: parse(blocks[0]), light: parse(blocks[1]) }
}

const TOKENS = ['bg', 'surface', 'border', 'fg', 'fg-muted', 'accent', 'on-accent', 'accent-ink', 'court', 'on-court', 'court-ink']

const READABLE_PAIRS: Array<[string, string]> = [
  ['fg', 'bg'],
  ['fg', 'surface'],
  ['fg-muted', 'bg'],
  ['fg-muted', 'surface'],
  ['accent-ink', 'bg'],
  ['accent-ink', 'surface'],
  ['court-ink', 'bg'],
  ['court-ink', 'surface'],
  ['on-accent', 'accent'],
  ['on-court', 'court'],
]

describe('Rustic design tokens', () => {
  const themes = readThemes()

  it('uses the night background in dark mode, which is the default', () => {
    expect(themes.dark.bg.toUpperCase()).toBe('#021716')
  })

  it.each(['dark', 'light'] as const)('defines every semantic token in %s mode', (mode) => {
    expect(Object.keys(themes[mode]).sort()).toEqual([...TOKENS].sort())
  })

  it.each(['dark', 'light'] as const)('keeps text pairs at 4.5:1 or more in %s mode', (mode) => {
    for (const [fg, bg] of READABLE_PAIRS) {
      const ratio = contrastRatio(themes[mode][fg], themes[mode][bg])
      expect(ratio, `${mode}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
    }
  })
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@/lib/design/contrast'
import { clubTheme, MIN_CONTRAST, RUSTIC, supportHue, THEME_TOKENS, themeCss, type Tokens } from '@/lib/domain/club-theme'

// The fallback palette in app/globals.css: the dark :root and the light one inside the media query.
function globalsPalette(): { dark: Record<string, string>; light: Record<string, string> } {
  const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')
  const [dark, light] = [...css.matchAll(/:root\s*\{([^}]*)\}/g)].map((match) =>
    Object.fromEntries([...match[1].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2].toUpperCase()])),
  )
  return { dark, light }
}

const READABLE: Array<[keyof Tokens, keyof Tokens]> = [
  ['fg', 'bg'], ['fg', 'surface'], ['fg-muted', 'bg'], ['fg-muted', 'surface'],
  ['accent-ink', 'bg'], ['accent-ink', 'surface'], ['court-ink', 'bg'], ['court-ink', 'surface'],
  ['danger', 'bg'], ['danger', 'surface'], ['on-accent', 'accent'], ['on-court', 'court'],
]
const PRIMARIES = { amber: '#FCB021', yellow: '#FFE600', white: '#FFFFFF', black: '#000000', blue: '#1D4ED8' }
const BACKGROUNDS = { dark: '#021716', light: '#F5F0E6', medium: '#3A6B5A', black: '#000000', red: '#B91C1C', orange: '#F7B55D', white: '#FFFFFF' }

describe('clubTheme', () => {
  it("gives Rustic's colors exactly today's palette of globals.css", () => {
    const theme = clubTheme({ primary: '#FCB021', background: '#021716' })
    expect(theme.dark).toEqual(RUSTIC.dark)
    expect(theme.light).toEqual(RUSTIC.light)
    expect(globalsPalette()).toEqual({ dark: RUSTIC.dark, light: RUSTIC.light })
  })

  for (const [primaryName, primary] of Object.entries(PRIMARIES)) {
    for (const [backgroundName, background] of Object.entries(BACKGROUNDS)) {
      it(`keeps every text at 4.5:1 with a ${primaryName} primary on a ${backgroundName} background`, () => {
        const theme = clubTheme({ primary, background })
        for (const mode of ['dark', 'light'] as const) {
          for (const [fg, bg] of READABLE) {
            const ratio = contrastRatio(theme[mode][fg], theme[mode][bg])
            expect(ratio, `${mode}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
          }
        }
      })
    }
  }

  it('uses the primary as is for buttons, with black or white on it, whichever reads better', () => {
    const theme = clubTheme({ primary: '#1D4ED8', background: '#021716' })
    expect(theme.dark.accent).toBe('#1D4ED8')
    expect(theme.light.accent).toBe('#1D4ED8')
    expect(theme.dark['on-accent']).toBe('#FFFFFF')
    expect(clubTheme({ primary: '#FFE600', background: '#021716' }).dark['on-accent']).toBe('#000000')
  })

  it('reports only what it corrected: the amber as text on light, for Rustic', () => {
    expect(clubTheme({ primary: '#FCB021', background: '#021716' }).adjusted).toEqual([{ mode: 'light', token: 'accent-ink' }])
    expect(clubTheme({ primary: '#1D4ED8', background: '#021716' }).adjusted).toEqual([{ mode: 'dark', token: 'accent-ink' }])
  })

  it('darkens a light background for dark mode and says so', () => {
    const theme = clubTheme({ primary: '#FCB021', background: '#F5F0E6' })
    expect(theme.adjusted).toContainEqual({ mode: 'dark', token: 'bg' })
    expect(contrastRatio('#FFFFFF', theme.dark.bg)).toBeGreaterThan(10)
  })

  it('uses a light background as is in light mode, with cards and borders a step darker', () => {
    const theme = clubTheme({ primary: '#193958', background: '#F7B55D' })
    expect(theme.light.bg).toBe('#F7B55D')
    expect(theme.light.surface).not.toBe('#F7B55D')
    expect(contrastRatio(theme.light.surface, theme.light.bg)).toBeGreaterThan(1.05)
    expect(contrastRatio(theme.light.border, theme.light.bg)).toBeGreaterThan(contrastRatio(theme.light.surface, theme.light.bg))
    expect(theme.adjusted).not.toContainEqual({ mode: 'light', token: 'bg' })
  })

  it('keeps cards visible on a black background', () => {
    const theme = clubTheme({ primary: '#FCB021', background: '#000000' })
    expect(theme.dark.bg).toBe('#000000')
    expect(theme.dark.surface).not.toBe('#000000')
    expect(contrastRatio(theme.dark.surface, theme.dark.bg)).toBeGreaterThan(1.15)
  })

  it('takes lower case and falls back to Rustic for what is not a color', () => {
    expect(clubTheme({ primary: '#fcb021', background: '#021716' }).dark.accent).toBe('#FCB021')
    const fallback = clubTheme({ primary: 'rojo', background: '#GGGGGG' })
    expect(fallback.dark).toEqual(RUSTIC.dark)
    expect(fallback.light).toEqual(RUSTIC.light)
  })
})

describe('themeCss', () => {
  const theme = clubTheme({ primary: '#E11D48', background: '#021716' })

  it('follows the device: dark by default, light inside the media query', () => {
    const css = themeCss(theme, 'system')
    expect(css.startsWith(':root:root{color-scheme:dark;--bg:#021716;')).toBe(true)
    expect(css).toContain('@media (prefers-color-scheme: light){:root:root{color-scheme:light;--bg:#FFFFFF;')
    expect(css).toContain('--accent:#E11D48;')
    for (const token of THEME_TOKENS) expect(css).toContain(`--${token}:`)
  })

  it('writes only the mode the club chose', () => {
    expect(themeCss(theme, 'dark')).toBe(`:root:root{color-scheme:dark;${THEME_TOKENS.map((t) => `--${t}:${theme.dark[t]};`).join('')}}`)
    expect(themeCss(theme, 'light')).toBe(`:root:root{color-scheme:light;${THEME_TOKENS.map((t) => `--${t}:${theme.light[t]};`).join('')}}`)
    expect(themeCss(theme, 'light')).not.toContain('@media')
  })
})

describe('the support color', () => {
  it('keeps Rustic blue for a primary far from blue, and for a gray one', () => {
    expect(supportHue('#FCB021')).toBe(250)
    expect(supportHue('#E53935')).toBe(250)
    expect(supportHue('#6B7280')).toBe(250)
    expect(clubTheme({ primary: '#E53935', background: '#101010' }).dark.court).toBe(RUSTIC.dark.court)
  })

  it('moves away from a blue primary, so the app is not one color', () => {
    const theme = clubTheme({ primary: '#2563EB', background: '#374151' })
    expect(supportHue('#2563EB')).toBe(150)
    expect(theme.dark.court).not.toBe(RUSTIC.dark.court)
    expect(contrastRatio(theme.dark['court-ink'], theme.dark.bg)).toBeGreaterThanOrEqual(MIN_CONTRAST)
    expect(contrastRatio(theme.light['court-ink'], theme.light.bg)).toBeGreaterThanOrEqual(MIN_CONTRAST)
    expect(contrastRatio(theme.dark['on-court'], theme.dark.court)).toBeGreaterThanOrEqual(MIN_CONTRAST)
  })
})

import { contrastRatio } from '@/lib/design/contrast'
import { hexToOklch, oklchToHex, type Oklch } from '@/lib/design/oklch'

export const THEME_TOKENS = [
  'bg', 'surface', 'border', 'fg', 'fg-muted', 'accent', 'on-accent', 'accent-ink', 'court', 'on-court', 'court-ink', 'danger',
] as const
export type ThemeToken = (typeof THEME_TOKENS)[number]
export type Tokens = Record<ThemeToken, string>
export type ThemeMode = 'dark' | 'light'
export type ColorMode = 'system' | ThemeMode
// What the calculation changed from what the admin picked: shown as a notice in Ajustes.
export type Adjustment = { mode: 'dark'; token: 'bg' | 'accent-ink' } | { mode: 'light'; token: 'accent-ink' }
export type ClubTheme = { dark: Tokens; light: Tokens; adjusted: Adjustment[] }
export type BrandColors = { primary: string; background: string }

export const DEFAULT_PRIMARY = '#FCB021'
export const DEFAULT_BACKGROUND = '#021716'
export const MIN_CONTRAST = 4.5

// Rustic's palette (the one app/globals.css keeps as a fallback). Every other club's palette is this one moved to
// its colors: the same lightness steps, its hue, its chroma in proportion.
export const RUSTIC: { dark: Tokens; light: Tokens } = {
  dark: {
    bg: '#021716', surface: '#0A2624', border: '#1E3A38', fg: '#FFFFFF', 'fg-muted': '#B8C4C3',
    accent: '#FCB021', 'on-accent': '#000000', 'accent-ink': '#FCB021',
    court: '#025995', 'on-court': '#FFFFFF', 'court-ink': '#4DA3DB', danger: '#FF8A7A',
  },
  light: {
    bg: '#FFFFFF', surface: '#F1F4F4', border: '#D5DCDB', fg: '#021716', 'fg-muted': '#4A5857',
    accent: '#FCB021', 'on-accent': '#000000', 'accent-ink': '#8A5A00',
    court: '#025995', 'on-court': '#FFFFFF', 'court-ink': '#025995', danger: '#B42318',
  },
}

const HEX6 = /^#[0-9a-f]{6}$/i
// A background lighter than this (OKLCH lightness) is darkened for dark mode: surfaces and borders go lighter still.
const DARK_BG_MAX_L = 0.3
// Surfaces step up from at least this lightness, so cards still show on a black background.
const DARK_STEP_FROM_L = 0.15

const lch = hexToOklch
const DEFAULT_BG = lch(DEFAULT_BACKGROUND)
const DEFAULT_ACCENT = lch(DEFAULT_PRIMARY)

// The step from Rustic's background (or accent) to one of its tokens, applied to another color: lightness either
// moved by the same amount (relative) or set to the token's (absolute), chroma in proportion, hue turned the same.
// With Rustic's own color it gives back the token exactly.
function derive(base: Oklch, from: Oklch, to: Oklch, lightness: 'relative' | 'absolute'): string {
  const l = lightness === 'relative' ? base.l + (to.l - from.l) : to.l
  return oklchToHex({
    l: Math.min(1, Math.max(0, l)),
    c: from.c > 0 ? base.c * (to.c / from.c) : to.c,
    h: base.h + (to.h - from.h),
  })
}

const readable = (color: string, backgrounds: string[]) =>
  backgrounds.every((background) => contrastRatio(color, background) >= MIN_CONTRAST)

// The color as is when it reads on every background; otherwise lighter (dark mode) or darker (light mode) in
// small steps until it does. White or black when nothing in between reads.
function ensureReadable(color: string, backgrounds: string[], direction: 'lighter' | 'darker'): string {
  if (readable(color, backgrounds)) return color
  const start = lch(color)
  const sign = direction === 'lighter' ? 1 : -1
  for (let step = 1; step <= 100; step++) {
    const candidate = oklchToHex({ ...start, l: Math.min(1, Math.max(0, start.l + sign * step * 0.01)) })
    if (readable(candidate, backgrounds)) return candidate
  }
  return direction === 'lighter' ? '#FFFFFF' : '#000000'
}

function onColor(color: string): string {
  return contrastRatio('#000000', color) >= contrastRatio('#FFFFFF', color) ? '#000000' : '#FFFFFF'
}

function darkTokens(primary: string, background: string): { tokens: Tokens; adjusted: Adjustment[] } {
  const adjusted: Adjustment[] = []
  const given = lch(background)
  const darkened = given.l > DARK_BG_MAX_L
  const base = darkened ? { ...given, l: DARK_BG_MAX_L } : given
  const bg = darkened ? oklchToHex(base) : background
  if (darkened) adjusted.push({ mode: 'dark', token: 'bg' })
  const D = RUSTIC.dark
  const stepFrom = { ...base, l: Math.max(base.l, DARK_STEP_FROM_L) }
  const surface = derive(stepFrom, DEFAULT_BG, lch(D.surface), 'relative')
  const border = derive(stepFrom, DEFAULT_BG, lch(D.border), 'relative')
  const on = [bg, surface]
  const accentInk = ensureReadable(primary, on, 'lighter')
  if (accentInk !== primary) adjusted.push({ mode: 'dark', token: 'accent-ink' })
  return {
    adjusted,
    tokens: {
      bg,
      surface,
      border,
      fg: ensureReadable(derive(base, DEFAULT_BG, lch(D.fg), 'absolute'), on, 'lighter'),
      'fg-muted': ensureReadable(derive(base, DEFAULT_BG, lch(D['fg-muted']), 'absolute'), on, 'lighter'),
      accent: primary,
      'on-accent': onColor(primary),
      'accent-ink': accentInk,
      court: D.court,
      'on-court': D['on-court'],
      'court-ink': ensureReadable(D['court-ink'], on, 'lighter'),
      danger: ensureReadable(D.danger, on, 'lighter'),
    },
  }
}

function lightTokens(primary: string, background: string): { tokens: Tokens; adjusted: Adjustment[] } {
  const adjusted: Adjustment[] = []
  const base = lch(background)
  const L = RUSTIC.light
  const bg = derive(base, DEFAULT_BG, lch(L.bg), 'absolute')
  const surface = derive(base, DEFAULT_BG, lch(L.surface), 'absolute')
  const on = [bg, surface]
  let accentInk = primary
  if (!readable(primary, on)) {
    // Toward Rustic's amber-ink: its lightness (or the primary's, if already darker), the primary's hue.
    const given = lch(primary)
    const anchor = lch(L['accent-ink'])
    const toward = derive(given, DEFAULT_ACCENT, { ...anchor, l: Math.min(given.l, anchor.l) }, 'absolute')
    accentInk = ensureReadable(toward, on, 'darker')
    adjusted.push({ mode: 'light', token: 'accent-ink' })
  }
  return {
    adjusted,
    tokens: {
      bg,
      surface,
      border: derive(base, DEFAULT_BG, lch(L.border), 'absolute'),
      fg: ensureReadable(derive(base, DEFAULT_BG, lch(L.fg), 'absolute'), on, 'darker'),
      'fg-muted': ensureReadable(derive(base, DEFAULT_BG, lch(L['fg-muted']), 'absolute'), on, 'darker'),
      accent: primary,
      'on-accent': onColor(primary),
      'accent-ink': accentInk,
      court: L.court,
      'on-court': L['on-court'],
      'court-ink': ensureReadable(L['court-ink'], on, 'darker'),
      danger: ensureReadable(L.danger, on, 'darker'),
    },
  }
}

// The club's whole palette, worked out from its two colors. A value that is not #RRGGBB falls back to Rustic's.
export function clubTheme({ primary, background }: BrandColors): ClubTheme {
  const p = HEX6.test(primary) ? primary.toUpperCase() : DEFAULT_PRIMARY
  const b = HEX6.test(background) ? background.toUpperCase() : DEFAULT_BACKGROUND
  const dark = darkTokens(p, b)
  const light = lightTokens(p, b)
  return { dark: dark.tokens, light: light.tokens, adjusted: [...dark.adjusted, ...light.adjusted] }
}

function block(tokens: Tokens, mode: ThemeMode): string {
  const vars = THEME_TOKENS.map((token) => `--${token}:${tokens[token]};`).join('')
  // :root:root outranks the fallback :root blocks of globals.css, wherever this style lands in the page.
  return `:root:root{color-scheme:${mode};${vars}}`
}

// The <style> the root layout writes: both modes following the device, or only the one the club chose.
export function themeCss(theme: ClubTheme, mode: ColorMode): string {
  if (mode === 'dark') return block(theme.dark, 'dark')
  if (mode === 'light') return block(theme.light, 'light')
  return `${block(theme.dark, 'dark')}@media (prefers-color-scheme: light){${block(theme.light, 'light')}}`
}

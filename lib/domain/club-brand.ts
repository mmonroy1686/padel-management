import type { MetadataRoute, Viewport } from 'next'
import {
  clubTheme,
  DEFAULT_BACKGROUND,
  DEFAULT_PRIMARY,
  type Adjustment,
  type BrandColors,
  type ColorMode,
} from './club-theme'
import type { ParseResult } from './settings'

export type Brand = BrandColors & { mode: ColorMode }
type BrandRow = { brand_primary: string; brand_background: string; color_mode: ColorMode }

export const COLOR_MODES = ['system', 'dark', 'light'] as const satisfies readonly ColorMode[]
export const COLOR_MODE_LABELS: Record<ColorMode, string> = {
  system: 'Según el dispositivo',
  dark: 'Siempre oscuro',
  light: 'Siempre claro',
}
export const DEFAULT_BRAND: Brand = { primary: DEFAULT_PRIMARY, background: DEFAULT_BACKGROUND, mode: 'system' }

const HEX6 = /^#?([0-9a-f]{6})$/i

// '#fcb021', 'fcb021' or ' #FCB021 ' → '#FCB021'. Anything else (#FFF, names) → null.
export function normalizeHex(value: string): string | null {
  const match = HEX6.exec(value.trim())
  return match ? `#${match[1].toUpperCase()}` : null
}

export function brandOf(club: BrandRow): Brand {
  return { primary: club.brand_primary, background: club.brand_background, mode: club.color_mode }
}

// Ajustes → "Marca del club". The RPC checks again; this gives the admin a message per field.
export function parseBrandForm(form: FormData): ParseResult<Brand> {
  const read = (name: string) => {
    const value = form.get(name)
    return typeof value === 'string' ? value : ''
  }
  const primary = normalizeHex(read('primary'))
  if (!primary) return { ok: false, message: 'Revisá el color principal: tiene que ser #RRGGBB, por ejemplo #FCB021.' }
  const background = normalizeHex(read('background'))
  if (!background) return { ok: false, message: 'Revisá el color de fondo: tiene que ser #RRGGBB, por ejemplo #021716.' }
  const mode = read('mode')
  if (!(COLOR_MODES as readonly string[]).includes(mode)) return { ok: false, message: 'Elegí cómo se ve la app.' }
  return { ok: true, value: { primary, background, mode: mode as ColorMode } }
}

const NOTICES: { [A in Adjustment as `${A['mode']}:${A['token']}`]: string } = {
  'dark:bg': 'Tu fondo es claro: en modo oscuro se usa una versión más oscura.',
  'dark:accent-ink': 'Tu color principal, como texto sobre fondo oscuro, se aclara un poco para que se lea.',
  'light:accent-ink': 'Tu color principal, como texto sobre fondo claro, se oscurece un poco para que se lea.',
}

// One line for the notice under the preview: only what the chosen mode will show. null when nothing changed.
export function adjustmentNotice(adjusted: Adjustment[], mode: ColorMode): string | null {
  const shown = adjusted.filter((adjustment) => mode === 'system' || adjustment.mode === mode)
  return shown.length === 0 ? null : shown.map((adjustment) => NOTICES[`${adjustment.mode}:${adjustment.token}` as keyof typeof NOTICES]).join(' ')
}

// "Rustic Pádel" → "RP": for the icon and the placeholder logo while the club has none.
export function clubInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')
}

// The browser bar: the background of the mode the club shows (both, following the device, with 'system').
export function brandViewport(brand: Brand): Pick<Viewport, 'themeColor' | 'colorScheme'> {
  const theme = clubTheme(brand)
  if (brand.mode === 'dark') return { themeColor: theme.dark.bg, colorScheme: 'dark' }
  if (brand.mode === 'light') return { themeColor: theme.light.bg, colorScheme: 'light' }
  return {
    themeColor: [
      { media: '(prefers-color-scheme: dark)', color: theme.dark.bg },
      { media: '(prefers-color-scheme: light)', color: theme.light.bg },
    ],
    colorScheme: 'dark light',
  }
}

// app/manifest.ts: the app installed on the phone, with the club's name, colors and icon.
export function webManifest(name: string, brand: Brand): MetadataRoute.Manifest {
  const theme = clubTheme(brand)
  const tokens = brand.mode === 'light' ? theme.light : theme.dark
  return {
    name,
    short_name: name,
    description: `Reservá cancha y armá partido en ${name}.`,
    start_url: '/',
    display: 'standalone',
    background_color: tokens.bg,
    theme_color: tokens.bg,
    icons: [
      { src: '/icon', sizes: '512x512', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  }
}

import { describe, expect, it } from 'vitest'
import {
  adjustmentNotice,
  brandOf,
  brandViewport,
  clubInitials,
  DEFAULT_BRAND,
  normalizeHex,
  parseBrandForm,
  webManifest,
} from '@/lib/domain/club-brand'

function form(values: Record<string, string>): FormData {
  const data = new FormData()
  for (const [name, value] of Object.entries(values)) data.set(name, value)
  return data
}

describe('normalizeHex', () => {
  it('takes #RRGGBB in any case, with or without # and spaces, in upper case', () => {
    expect(normalizeHex('#fcb021')).toBe('#FCB021')
    expect(normalizeHex(' e11d48 ')).toBe('#E11D48')
  })

  it('rejects short hex, names and letters past F', () => {
    expect(normalizeHex('#FFF')).toBeNull()
    expect(normalizeHex('rojo')).toBeNull()
    expect(normalizeHex('#GGGGGG')).toBeNull()
  })
})

describe('brandOf', () => {
  it('reads the club row', () => {
    expect(brandOf({ brand_primary: '#E11D48', brand_background: '#1A1A2E', color_mode: 'dark' })).toEqual({
      primary: '#E11D48',
      background: '#1A1A2E',
      mode: 'dark',
    })
  })
})

describe('parseBrandForm', () => {
  it('reads both colors and the mode', () => {
    expect(parseBrandForm(form({ primary: '#e11d48', background: '1a1a2e', mode: 'light' }))).toEqual({
      ok: true,
      value: { primary: '#E11D48', background: '#1A1A2E', mode: 'light' },
    })
  })

  it('says which color is wrong', () => {
    expect(parseBrandForm(form({ primary: '#FFF', background: '#021716', mode: 'system' }))).toEqual({
      ok: false,
      message: 'Revisá el color principal: tiene que ser #RRGGBB, por ejemplo #FCB021.',
    })
    expect(parseBrandForm(form({ primary: '#FCB021', background: 'verde', mode: 'system' }))).toEqual({
      ok: false,
      message: 'Revisá el color de fondo: tiene que ser #RRGGBB, por ejemplo #021716.',
    })
    expect(parseBrandForm(form({ primary: '#FCB021', background: '#021716', mode: 'sepia' }))).toEqual({
      ok: false,
      message: 'Elegí cómo se ve la app.',
    })
  })
})

describe('adjustmentNotice', () => {
  const amberOnLight = [{ mode: 'light', token: 'accent-ink' }] as const

  it('explains what changed in the modes the club shows', () => {
    expect(adjustmentNotice([...amberOnLight], 'system')).toBe(
      'Tu color principal, como texto sobre fondo claro, se oscurece un poco para que se lea.',
    )
    expect(adjustmentNotice([...amberOnLight], 'light')).not.toBeNull()
  })

  it('says nothing about a mode the club never shows, or when nothing changed', () => {
    expect(adjustmentNotice([...amberOnLight], 'dark')).toBeNull()
    expect(adjustmentNotice([], 'system')).toBeNull()
  })

  it('joins several in one line', () => {
    expect(
      adjustmentNotice([{ mode: 'dark', token: 'bg' }, { mode: 'dark', token: 'accent-ink' }], 'dark'),
    ).toBe(
      'Tu fondo es claro: en modo oscuro se usa una versión más oscura. Tu color principal, como texto sobre fondo oscuro, se aclara un poco para que se lea.',
    )
  })
})

describe('clubInitials', () => {
  it('takes the first letter of the first two words', () => {
    expect(clubInitials('Rustic Pádel')).toBe('RP')
    expect(clubInitials('  club  del lago ')).toBe('CD')
    expect(clubInitials('Rustic')).toBe('R')
  })
})

describe('brandViewport', () => {
  it("colors the browser bar with each mode's background, following the device", () => {
    expect(brandViewport(DEFAULT_BRAND)).toEqual({
      themeColor: [
        { media: '(prefers-color-scheme: dark)', color: '#021716' },
        { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
      ],
      colorScheme: 'dark light',
    })
  })

  it('uses only the mode the club chose', () => {
    expect(brandViewport({ ...DEFAULT_BRAND, mode: 'dark' })).toEqual({ themeColor: '#021716', colorScheme: 'dark' })
    expect(brandViewport({ ...DEFAULT_BRAND, mode: 'light' })).toEqual({ themeColor: '#FFFFFF', colorScheme: 'light' })
  })
})

describe('webManifest', () => {
  it("installs the app with the club's name, background and icons", () => {
    const manifest = webManifest('Rustic Pádel', DEFAULT_BRAND)
    expect(manifest).toMatchObject({
      name: 'Rustic Pádel',
      short_name: 'Rustic Pádel',
      start_url: '/',
      display: 'standalone',
      background_color: '#021716',
      theme_color: '#021716',
    })
    expect(manifest.icons).toEqual([
      { src: '/icon', sizes: '512x512', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ])
    expect(webManifest('Rustic Pádel', { ...DEFAULT_BRAND, mode: 'light' }).theme_color).toBe('#FFFFFF')
  })
})

import { describe, expect, it } from 'vitest'
import {
  checkFlyerSource,
  checkLogoFile,
  clubLogoUrl,
  coverRect,
  flyerBackgroundPath,
  isClubFlyerBackgroundPath,
  isClubLogoPath,
  logoPath,
} from '@/lib/domain/club-logo'

const CLUB = 'a0000000-0000-0000-0000-000000000001'

describe('logoPath', () => {
  it('puts the logo in the club folder, keeping only the extension of the file name', () => {
    expect(logoPath(CLUB, 'Logo Rustic.SVG', 123)).toBe(`${CLUB}/logo-123.svg`)
    expect(logoPath(CLUB, '../../x.png', 123)).toBe(`${CLUB}/logo-123.png`)
  })
})

describe('isClubLogoPath', () => {
  it('accepts only a logo of that club, as logoPath names it', () => {
    expect(isClubLogoPath(CLUB, `${CLUB}/logo-123.png`)).toBe(true)
    expect(isClubLogoPath(CLUB, 'a0000000-0000-0000-0000-000000000002/logo-123.png')).toBe(false)
    expect(isClubLogoPath(CLUB, `${CLUB}/../logo-1.png`)).toBe(false)
    expect(isClubLogoPath(CLUB, `${CLUB}/logo-1.exe`)).toBe(false)
  })
})

describe('checkLogoFile', () => {
  it('takes PNG, JPG, WebP or SVG up to 2 MB', () => {
    expect(checkLogoFile({ type: 'image/png', size: 1000 })).toBeNull()
    expect(checkLogoFile({ type: 'image/svg+xml', size: 1000 })).toBeNull()
    expect(checkLogoFile({ type: 'application/pdf', size: 1000 })).toBe('Subí una imagen PNG, JPG, WebP o SVG.')
    expect(checkLogoFile({ type: 'image/png', size: 3 * 1024 * 1024 })).toBe('El logo pesa más de 2 MB. Probá con una versión más liviana.')
  })
})

describe('clubLogoUrl', () => {
  it('is the public Storage URL, or null without a logo', () => {
    expect(clubLogoUrl('https://x.supabase.co', `${CLUB}/logo-1.png`)).toBe(
      `https://x.supabase.co/storage/v1/object/public/club-logos/${CLUB}/logo-1.png`,
    )
    expect(clubLogoUrl('https://x.supabase.co', null)).toBeNull()
  })
})

describe('the flyer background', () => {
  it('lives in the club folder as the blurred JPG the browser makes', () => {
    expect(flyerBackgroundPath(CLUB, 1700000000000)).toBe(`${CLUB}/flyer-1700000000000.jpg`)
    expect(isClubFlyerBackgroundPath(CLUB, `${CLUB}/flyer-1700000000000.jpg`)).toBe(true)
    expect(isClubFlyerBackgroundPath(CLUB, `${CLUB}/logo-1700000000000.jpg`)).toBe(false)
    expect(isClubFlyerBackgroundPath(CLUB, `otro-club/flyer-1700000000000.jpg`)).toBe(false)
    expect(isClubFlyerBackgroundPath(CLUB, `${CLUB}/flyer-1700000000000.png`)).toBe(false)
  })

  it('takes a photo of up to 15 MB: it is shrunk before it is uploaded', () => {
    expect(checkFlyerSource({ type: 'image/jpeg', size: 8 * 1024 * 1024 })).toBeNull()
    expect(checkFlyerSource({ type: 'image/webp', size: 1000 })).toBeNull()
    expect(checkFlyerSource({ type: 'image/svg+xml', size: 1000 })).toBe('Subí una foto JPG, PNG o WebP.')
    expect(checkFlyerSource({ type: 'image/jpeg', size: 16 * 1024 * 1024 })).toBe(
      'La foto pesa más de 15 MB. Probá con una más liviana.',
    )
  })

  it('fits a picture over the flyer, cropping what is left over', () => {
    // A landscape photo over the vertical flyer: full height, centered.
    expect(coverRect({ width: 4000, height: 3000 }, { width: 90, height: 160 })).toEqual({ x: -61.67, y: 0, width: 213.33, height: 160 })
    // A tall one: full width.
    expect(coverRect({ width: 1000, height: 4000 }, { width: 90, height: 160 })).toEqual({ x: 0, y: -100, width: 90, height: 360 })
  })
})

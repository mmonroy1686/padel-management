import { describe, expect, it } from 'vitest'
import { checkLogoFile, clubLogoUrl, isClubLogoPath, logoPath } from '@/lib/domain/club-logo'

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

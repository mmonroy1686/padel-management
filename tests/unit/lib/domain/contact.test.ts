import { describe, expect, it } from 'vitest'
import { avatarPath, avatarSrc, checkAvatarFile, initialsOf, parseContactForm, playerWhatsappUrl } from '@/lib/domain/contact'

const form = (entries: Record<string, string>) => {
  const data = new FormData()
  for (const [name, value] of Object.entries(entries)) data.set(name, value)
  return data
}

describe('initialsOf', () => {
  it('takes the first and the last name, or one letter', () => {
    expect(initialsOf('Paula Ramírez')).toBe('PR')
    expect(initialsOf('  ana maría de los santos ')).toBe('AS')
    expect(initialsOf('Bruno')).toBe('B')
    expect(initialsOf('')).toBe('?')
  })
})

describe('playerWhatsappUrl', () => {
  it("opens the chat only with the player's consent, international, with an optional message", () => {
    expect(playerWhatsappUrl({ phone: '099123456', whatsappConsent: true }, 'America/Montevideo')).toBe('https://wa.me/59899123456')
    expect(playerWhatsappUrl({ phone: '099123456', whatsappConsent: true }, 'America/Montevideo', 'Hola Ana')).toBe(
      'https://wa.me/59899123456?text=Hola%20Ana',
    )
    expect(playerWhatsappUrl({ phone: '099123456', whatsappConsent: false }, 'America/Montevideo')).toBeNull()
    expect(playerWhatsappUrl({ phone: null, whatsappConsent: false }, 'America/Montevideo')).toBeNull()
    expect(playerWhatsappUrl(null, 'America/Montevideo')).toBeNull()
  })
})

describe('parseContactForm', () => {
  it('normalizes the number and reads the consent', () => {
    expect(parseContactForm(form({ phone: '+598 99 123 456', whatsappConsent: 'on' }))).toEqual({
      ok: true,
      value: { phone: '099123456', consent: true },
    })
    expect(parseContactForm(form({ phone: '' }))).toEqual({ ok: true, value: { phone: '', consent: false } })
  })

  it('asks for a number before consenting, and a real one', () => {
    expect(parseContactForm(form({ phone: '', whatsappConsent: 'on' }))).toMatchObject({ ok: false })
    expect(parseContactForm(form({ phone: '12' }))).toEqual({ ok: false, message: 'Revisá el número: por ejemplo 099 123 456.' })
  })
})

describe('the photo', () => {
  it("goes in the player's folder, named as the database accepts it", () => {
    expect(avatarPath('u1', 'image/png', 1700000000000)).toBe('u1/avatar-1700000000000.png')
    expect(avatarPath('u1', 'image/jpeg', 1)).toBe('u1/avatar-1.jpg')
  })

  it('only takes a light JPG, PNG or WebP', () => {
    expect(checkAvatarFile({ type: 'image/gif', size: 10 })).toBe('Subí una foto JPG, PNG o WebP.')
    expect(checkAvatarFile({ type: 'image/png', size: 3 * 1024 * 1024 })).toMatch(/2 MB/)
    expect(checkAvatarFile({ type: 'image/webp', size: 10 })).toBeNull()
  })

  it("shows the uploaded one, then Google's, then none", () => {
    expect(avatarSrc({ avatar_source: 'upload', avatar_path: 'u1/avatar-1.jpg', avatar_url: null }, 'https://x.supabase.co')).toBe(
      'https://x.supabase.co/storage/v1/object/public/avatars/u1/avatar-1.jpg',
    )
    expect(avatarSrc({ avatar_source: 'google', avatar_path: null, avatar_url: 'https://lh3/a' }, 'https://x')).toBe('https://lh3/a')
    expect(avatarSrc({ avatar_source: 'none', avatar_path: null, avatar_url: null }, 'https://x')).toBeNull()
    expect(avatarSrc({ avatar_source: null, avatar_path: null, avatar_url: null }, 'https://x')).toBeNull()
  })
})

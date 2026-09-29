import { describe, expect, it } from 'vitest'
import { getSiteUrl, safeNextPath } from '@/lib/auth/redirect'

describe('safeNextPath', () => {
  it.each(['/', '/reservar', '/partidos?fecha=2026-10-01'])('keeps the internal path %s', (path) => {
    expect(safeNextPath(path)).toBe(path)
  })

  it.each([
    null,
    undefined,
    42,
    '',
    'reservar',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
  ])('falls back to / for %j', (value) => {
    expect(safeNextPath(value)).toBe('/')
  })

  it('uses the given fallback', () => {
    expect(safeNextPath('//evil.example', '/inicio')).toBe('/inicio')
  })
})

describe('getSiteUrl', () => {
  it('prefers NEXT_PUBLIC_SITE_URL and drops the trailing slash', () => {
    expect(getSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://rustic.example/', VERCEL_URL: 'padel-abc.vercel.app' }))
      .toBe('https://rustic.example')
  })

  it('uses the stable production domain on Vercel production', () => {
    expect(getSiteUrl({
      VERCEL_ENV: 'production',
      VERCEL_PROJECT_PRODUCTION_URL: 'padel-management.vercel.app',
      VERCEL_URL: 'padel-management-abc123.vercel.app',
    })).toBe('https://padel-management.vercel.app')
  })

  it('uses the deployment URL on previews', () => {
    expect(getSiteUrl({ VERCEL_ENV: 'preview', VERCEL_URL: 'padel-git-feat-x.vercel.app' }))
      .toBe('https://padel-git-feat-x.vercel.app')
  })

  it('falls back to localhost', () => {
    expect(getSiteUrl({})).toBe('http://localhost:3000')
  })
})

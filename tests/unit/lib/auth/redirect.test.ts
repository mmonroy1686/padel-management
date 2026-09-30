import { describe, expect, it } from 'vitest'
import { getSiteUrl, originFromHeaders, safeNextPath, strayAuthCodeRedirect } from '@/lib/auth/redirect'

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

describe('originFromHeaders', () => {
  const headers = (entries: Record<string, string>) => (name: string) => entries[name] ?? null
  const FALLBACK = 'https://padel-management.vercel.app'

  it('uses the host the visitor is on, so the PKCE cookie and the callback share a domain', () => {
    expect(
      originFromHeaders(
        headers({ 'x-forwarded-host': 'padel-management-a3a5exqcx-team.vercel.app', 'x-forwarded-proto': 'https' }),
        FALLBACK,
      ),
    ).toBe('https://padel-management-a3a5exqcx-team.vercel.app')
  })

  it('falls back to the host header and to http on localhost', () => {
    expect(originFromHeaders(headers({ host: 'localhost:3000' }), FALLBACK)).toBe('http://localhost:3000')
    expect(originFromHeaders(headers({ host: 'rustic.example' }), FALLBACK)).toBe('https://rustic.example')
  })

  it('ignores hosts that are not plain host names', () => {
    expect(originFromHeaders(headers({ host: 'evil.example/path' }), FALLBACK)).toBe(FALLBACK)
    expect(originFromHeaders(headers({ 'x-forwarded-proto': 'javascript' , host: 'rustic.example' }), FALLBACK)).toBe(
      'https://rustic.example',
    )
    expect(originFromHeaders(headers({}), FALLBACK)).toBe(FALLBACK)
  })
})

describe('strayAuthCodeRedirect', () => {
  it('sends an auth code that landed on the home page to the callback', () => {
    const target = strayAuthCodeRedirect(new URL('https://rustic.example/?code=abc-123'))
    expect(target?.toString()).toBe('https://rustic.example/auth/callback?code=abc-123&next=%2F')
  })

  it('leaves every other URL alone', () => {
    expect(strayAuthCodeRedirect(new URL('https://rustic.example/'))).toBeNull()
    expect(strayAuthCodeRedirect(new URL('https://rustic.example/reservar?code=abc'))).toBeNull()
    expect(strayAuthCodeRedirect(new URL('https://rustic.example/auth/callback?code=abc'))).toBeNull()
  })
})

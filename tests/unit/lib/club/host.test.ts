import { describe, expect, it } from 'vitest'
import { clubSlugFromHost, clubUrl } from '@/lib/club/host'

const ENV = { NEXT_PUBLIC_ROOT_DOMAIN: 'pique.uy', DEFAULT_CLUB_SLUG: 'rustic' }

describe('clubSlugFromHost', () => {
  it('takes the club from the subdomain of the root domain, any case and port', () => {
    expect(clubSlugFromHost('norte.pique.uy', ENV)).toBe('norte')
    expect(clubSlugFromHost('Norte.Pique.UY:443', ENV)).toBe('norte')
    expect(clubSlugFromHost('club-del-este.pique.uy', ENV)).toBe('club-del-este')
  })

  it('takes it from <slug>.localhost in local development', () => {
    expect(clubSlugFromHost('norte.localhost:3000', ENV)).toBe('norte')
    expect(clubSlugFromHost('norte.localhost:3000', { DEFAULT_CLUB_SLUG: 'rustic' })).toBe('norte')
  })

  it('falls back to the default club without a club subdomain', () => {
    for (const host of ['localhost:3000', '127.0.0.1:3000', 'pique.uy', 'www.pique.uy', 'padel-git-x.vercel.app', 'otro.com', null]) {
      expect(clubSlugFromHost(host, ENV)).toBe('rustic')
    }
  })

  it('does not take nested subdomains or names that are not a slug', () => {
    expect(clubSlugFromHost('a.b.pique.uy', ENV)).toBe('rustic')
    expect(clubSlugFromHost('-norte.pique.uy', ENV)).toBe('rustic')
    expect(clubSlugFromHost('evil.pique.uy.attacker.com', ENV)).toBe('rustic')
  })

  it('uses rustic when no default is configured, as the app did with one club', () => {
    expect(clubSlugFromHost('localhost:3000', {})).toBe('rustic')
  })
})

describe('clubUrl', () => {
  it('is the club subdomain of the root domain', () => {
    expect(clubUrl('norte', ENV)).toBe('https://norte.pique.uy')
  })

  it('is <slug>.localhost on the same port in local development', () => {
    expect(clubUrl('norte', {}, 'http://localhost:3000')).toBe('http://norte.localhost:3000')
    expect(clubUrl('norte', {}, 'http://rustic.localhost:3000')).toBe('http://norte.localhost:3000')
  })

  it('is the site URL without a root domain (previews, one club)', () => {
    expect(clubUrl('rustic', { VERCEL_URL: 'padel-git-x.vercel.app' })).toBe('https://padel-git-x.vercel.app')
    expect(clubUrl('rustic', { NEXT_PUBLIC_SITE_URL: 'https://reservas.rustic.uy/' })).toBe('https://reservas.rustic.uy')
  })
})

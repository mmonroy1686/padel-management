import { getSiteUrl } from '@/lib/auth/redirect'

// Which club a request is for: one club per subdomain of the product's domain (NEXT_PUBLIC_ROOT_DOMAIN), or of
// localhost in local development. Without a club subdomain (localhost, *.vercel.app previews, the bare domain, www) it is
// DEFAULT_CLUB_SLUG, so a single-club deploy works as before.

type Env = Record<string, string | undefined>

// The same shape create_club will accept: lowercase letters, digits and inner dashes.
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/
const NOT_A_CLUB = new Set(['www'])
const FALLBACK_SLUG = 'rustic'

export function defaultClubSlug(env: Env = process.env): string {
  return env.DEFAULT_CLUB_SLUG?.trim() || FALLBACK_SLUG
}

function subdomainOf(host: string, parent: string): string | null {
  if (!host.endsWith(`.${parent}`)) return null
  const label = host.slice(0, -(parent.length + 1))
  return SLUG.test(label) && !NOT_A_CLUB.has(label) ? label : null
}

export function clubSlugFromHost(rawHost: string | null, env: Env = process.env): string {
  const host = rawHost?.trim().toLowerCase().replace(/:\d+$/, '') ?? ''
  const root = env.NEXT_PUBLIC_ROOT_DOMAIN?.trim().toLowerCase()
  return (root ? subdomainOf(host, root) : null) ?? subdomainOf(host, 'localhost') ?? defaultClubSlug(env)
}

// Where a club lives. With a root domain, its subdomain. In local development (the current origin is localhost),
// <slug>.localhost on the same port. Otherwise (previews, a single-club deploy) the site URL.
export function clubUrl(slug: string, env: Env = process.env, currentOrigin?: string): string {
  const root = env.NEXT_PUBLIC_ROOT_DOMAIN?.trim().toLowerCase()
  if (root) return `https://${slug}.${root}`
  if (currentOrigin) {
    const url = new URL(currentOrigin)
    if (url.hostname === 'localhost' || url.hostname.endsWith('.localhost')) {
      return `${url.protocol}//${slug}.localhost${url.port ? `:${url.port}` : ''}`
    }
  }
  return getSiteUrl(env)
}

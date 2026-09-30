type Env = Record<string, string | undefined>

// Browsers strip tabs and newlines from URLs and treat "\" like "/",
// so "/\t/evil.example" would end up as the protocol-relative "//evil.example".
const UNSAFE_CHARACTERS = /[\s\\\u0000-\u001f]/

export function safeNextPath(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string') return fallback
  if (!value.startsWith('/') || value.startsWith('//')) return fallback
  if (UNSAFE_CHARACTERS.test(value)) return fallback
  return value
}

const HOST = /^[a-z0-9.-]+(:\d{1,5})?$/i
const LOCAL_HOST = /^(localhost|127\.0\.0\.1)(:\d+)?$/i

// The origin the visitor is on. Auth callbacks must come back to it: the PKCE verifier cookie lives
// on that host, and Supabase still checks the URL against its allow list, so this opens no redirect.
export function originFromHeaders(get: (name: string) => string | null, fallback: string): string {
  const host = (get('x-forwarded-host') ?? get('host'))?.split(',')[0]?.trim()
  if (!host || !HOST.test(host)) return fallback
  const forwarded = get('x-forwarded-proto')?.split(',')[0]?.trim()
  const protocol = forwarded === 'http' || forwarded === 'https' ? forwarded : LOCAL_HOST.test(host) ? 'http' : 'https'
  return `${protocol}://${host}`
}

// When Supabase falls back to the Site URL it lands the auth code on "/": forward it to the callback.
export function strayAuthCodeRedirect(url: URL): URL | null {
  const code = url.searchParams.get('code')
  if (url.pathname !== '/' || !code) return null
  const target = new URL('/auth/callback', url)
  target.searchParams.set('code', code)
  target.searchParams.set('next', '/')
  return target
}

export function getSiteUrl(env: Env = process.env): string {
  if (env.NEXT_PUBLIC_SITE_URL) return env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '')
  if (env.VERCEL_ENV === 'production' && env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`
  return 'http://localhost:3000'
}

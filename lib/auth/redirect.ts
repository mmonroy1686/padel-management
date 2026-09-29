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

export function getSiteUrl(env: Env = process.env): string {
  if (env.NEXT_PUBLIC_SITE_URL) return env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '')
  if (env.VERCEL_ENV === 'production' && env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`
  return 'http://localhost:3000'
}

import { scrub } from './scrub'

// Sentry's options for the server, the edge and the browser. Without NEXT_PUBLIC_SENTRY_DSN it is off: nothing is sent
// from CI, local development or the e2e. Errors only, with emails and phones scrubbed from every event and breadcrumb;
// sendDefaultPii off (no cookies or IPs), no tracing and no replays. The environment tells production from previews.
export type SentryOptions = {
  dsn: string
  environment: string
  sendDefaultPii: false
  tracesSampleRate: 0
  beforeSend: <T>(event: T) => T
  beforeBreadcrumb: <T>(breadcrumb: T) => T | null
}

type Env = { NEXT_PUBLIC_SENTRY_DSN?: string; NEXT_PUBLIC_VERCEL_ENV?: string; VERCEL_ENV?: string }

export function sentryOptions(env: Env): SentryOptions | null {
  const dsn = env.NEXT_PUBLIC_SENTRY_DSN?.trim()
  if (!dsn) return null
  return {
    dsn,
    environment: env.NEXT_PUBLIC_VERCEL_ENV || env.VERCEL_ENV || 'development',
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: (event) => scrub(event),
    // The browser's console lines can carry anything a component logged: they don't go.
    beforeBreadcrumb: (breadcrumb) =>
      (breadcrumb as { category?: string }).category === 'console' ? null : scrub(breadcrumb),
  }
}

// Next inlines NEXT_PUBLIC_ variables only when they are read by name, so the browser bundle needs this literal read.
// VERCEL_ENV is there on the server even when Vercel does not expose the NEXT_PUBLIC_ copy.
export function publicSentryEnv(): Env {
  return {
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
  }
}

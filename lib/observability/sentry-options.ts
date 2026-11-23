// Sentry's options for the server, the edge and the browser. Without NEXT_PUBLIC_SENTRY_DSN it is off: nothing is sent
// from CI, local development or the e2e. Errors only: no personal data (sendDefaultPii), no performance tracing and no
// session replays. NEXT_PUBLIC_VERCEL_ENV (Vercel sets it) keeps preview deploys apart from production.
export type SentryOptions = {
  dsn: string
  environment: string
  sendDefaultPii: false
  tracesSampleRate: 0
}

type Env = { NEXT_PUBLIC_SENTRY_DSN?: string; NEXT_PUBLIC_VERCEL_ENV?: string }

export function sentryOptions(env: Env): SentryOptions | null {
  const dsn = env.NEXT_PUBLIC_SENTRY_DSN?.trim()
  if (!dsn) return null
  return { dsn, environment: env.NEXT_PUBLIC_VERCEL_ENV || 'development', sendDefaultPii: false, tracesSampleRate: 0 }
}

// Next inlines NEXT_PUBLIC_ variables only when they are read by name, so the browser bundle needs this literal read.
export function publicSentryEnv(): Env {
  return { NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN, NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV }
}

import { describe, expect, it } from 'vitest'
import { sentryOptions } from '@/lib/observability/sentry-options'

describe('sentryOptions', () => {
  it('is off without a DSN, so nothing is sent from CI, local or the e2e', () => {
    expect(sentryOptions({})).toBeNull()
    expect(sentryOptions({ NEXT_PUBLIC_SENTRY_DSN: '  ' })).toBeNull()
  })

  it('sends errors only: no personal data, no tracing, no replays', () => {
    expect(sentryOptions({ NEXT_PUBLIC_SENTRY_DSN: 'https://key@o1.ingest.sentry.io/2' })).toEqual({
      dsn: 'https://key@o1.ingest.sentry.io/2',
      environment: 'development',
      sendDefaultPii: false,
      tracesSampleRate: 0,
    })
  })

  it('tells production from preview deploys', () => {
    const dsn = 'https://key@o1.ingest.sentry.io/2'
    expect(sentryOptions({ NEXT_PUBLIC_SENTRY_DSN: dsn, NEXT_PUBLIC_VERCEL_ENV: 'production' })?.environment).toBe('production')
    expect(sentryOptions({ NEXT_PUBLIC_SENTRY_DSN: dsn, NEXT_PUBLIC_VERCEL_ENV: 'preview' })?.environment).toBe('preview')
  })
})

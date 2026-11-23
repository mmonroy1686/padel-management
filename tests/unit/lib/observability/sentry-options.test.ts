import { describe, expect, it } from 'vitest'
import { sentryOptions } from '@/lib/observability/sentry-options'

const DSN = 'https://key@o1.ingest.sentry.io/2'

describe('sentryOptions', () => {
  it('is off without a DSN, so nothing is sent from CI, local or the e2e', () => {
    expect(sentryOptions({})).toBeNull()
    expect(sentryOptions({ NEXT_PUBLIC_SENTRY_DSN: '  ' })).toBeNull()
  })

  it('sends errors only: no default personal data, no tracing', () => {
    expect(sentryOptions({ NEXT_PUBLIC_SENTRY_DSN: DSN })).toMatchObject({
      dsn: DSN,
      environment: 'development',
      sendDefaultPii: false,
      tracesSampleRate: 0,
    })
  })

  it('scrubs emails and phones from events and drops console breadcrumbs', () => {
    const options = sentryOptions({ NEXT_PUBLIC_SENTRY_DSN: DSN })
    expect(options?.beforeSend({ message: 'failed for ana@x.uy' })).toEqual({ message: 'failed for [email]' })
    expect(options?.beforeBreadcrumb({ category: 'console', message: 'debug' })).toBeNull()
    expect(options?.beforeBreadcrumb({ category: 'navigation', data: { to: '/perfil?tel=099123456' } })).toEqual({
      category: 'navigation',
      data: { to: '/perfil?tel=[teléfono]' },
    })
  })

  it('tells production from preview deploys, with or without the public copy of VERCEL_ENV', () => {
    expect(sentryOptions({ NEXT_PUBLIC_SENTRY_DSN: DSN, NEXT_PUBLIC_VERCEL_ENV: 'production' })?.environment).toBe('production')
    expect(sentryOptions({ NEXT_PUBLIC_SENTRY_DSN: DSN, VERCEL_ENV: 'preview' })?.environment).toBe('preview')
  })
})

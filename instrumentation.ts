import * as Sentry from '@sentry/nextjs'
import { publicSentryEnv, sentryOptions } from '@/lib/observability/sentry-options'

// Error monitoring on the server and the edge (proxy.ts). Off without NEXT_PUBLIC_SENTRY_DSN.
export function register() {
  const options = sentryOptions(publicSentryEnv())
  if (options) Sentry.init(options)
}

// Errors in Server Components, Server Actions, Route Handlers and the proxy. Without init there is no client, so it
// sends nothing.
export const onRequestError = Sentry.captureRequestError

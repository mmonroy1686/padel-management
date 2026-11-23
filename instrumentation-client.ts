import * as Sentry from '@sentry/nextjs'
import { publicSentryEnv, sentryOptions } from '@/lib/observability/sentry-options'

// Error monitoring in the browser. Off without NEXT_PUBLIC_SENTRY_DSN.
const options = sentryOptions(publicSentryEnv())
if (options) Sentry.init(options)

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart

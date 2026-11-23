import { withSentryConfig } from '@sentry/nextjs/config'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The free-slots flyer reads its font from disk (lib/brand/free-slots-image.tsx).
  outputFileTracingIncludes: {
    '/club/asistente/flyer': ['./assets/fonts/BarlowCondensed-ExtraBold.ttf'],
  },
}

// Source maps go to Sentry only when Vercel builds with SENTRY_AUTH_TOKEN (and SENTRY_ORG, SENTRY_PROJECT); without it
// the build is the same as before and stacks stay minified.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  silent: !process.env.CI,
  telemetry: false,
})

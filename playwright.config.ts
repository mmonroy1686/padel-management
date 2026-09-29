import { defineConfig, devices } from '@playwright/test'
import { localSupabase } from './tests/e2e/support/env'

const PORT = 3000

// E2E always runs against the local Supabase stack, even when .env.local points at production:
// the tests send magic links to fake addresses and write bookings.
// Next does not override variables already set in process.env, so these win over .env.local.
// CI exports them itself before running the tests.
function webServerEnv(): Record<string, string> {
  if (process.env.CI) return {}
  const { apiUrl, publishableKey } = localSupabase()
  return { NEXT_PUBLIC_SUPABASE_URL: apiUrl, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey }
}

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/support/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  // Mobile first: the club's players use the app from their phones.
  projects: [{ name: 'mobile-chrome', use: { ...devices['Pixel 7'] } }],
  webServer: {
    // CI builds before running the tests; locally the dev server is enough.
    command: process.env.CI ? 'npm run start' : 'npm run dev',
    url: `http://localhost:${PORT}`,
    // Never reuse a running dev server: it may be pointing at production.
    reuseExistingServer: false,
    env: webServerEnv(),
    timeout: 120_000,
  },
})

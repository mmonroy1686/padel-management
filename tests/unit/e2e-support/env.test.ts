import { afterEach, describe, expect, it, vi } from 'vitest'

function stubCiEnv(apiUrl: string) {
  vi.stubEnv('CI', '1')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', apiUrl)
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'publishable')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service')
  vi.stubEnv('MAILPIT_URL', 'http://127.0.0.1:54324')
}

describe('localSupabase', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('accepts the local stack', async () => {
    stubCiEnv('http://127.0.0.1:54321')
    const { localSupabase } = await import('../../e2e/support/env')
    expect(localSupabase().apiUrl).toBe('http://127.0.0.1:54321')
  })

  it('refuses any other Supabase, because the setup deletes users with the service role', async () => {
    stubCiEnv('https://psltjkoywathdbydrzjb.supabase.co')
    const { localSupabase } = await import('../../e2e/support/env')
    expect(() => localSupabase()).toThrow(/solo corren contra Supabase local/)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseEnv } from '@/lib/supabase/env'

describe('getSupabaseEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns the URL and publishable key', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-key')

    expect(getSupabaseEnv()).toEqual({ url: 'http://127.0.0.1:54321', publishableKey: 'test-key' })
  })

  it('names the missing URL variable', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-key')

    expect(() => getSupabaseEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
  })

  it('names the missing key variable', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '')

    expect(() => getSupabaseEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/)
  })
})

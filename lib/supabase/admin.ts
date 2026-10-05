import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { getSupabaseEnv } from './env'

// Service role: skips RLS. Only the outbox uses it, and only through claim_notification_emails and
// finish_notification_email. null without SUPABASE_SERVICE_ROLE_KEY: the avisos stay in the app.
// The key never gets a NEXT_PUBLIC_ prefix and this file never reaches the browser.
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!key) return null
  return createClient<Database>(getSupabaseEnv().url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

import 'server-only'
import { getSiteUrl } from '@/lib/auth/redirect'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSupabaseEnv } from '@/lib/supabase/env'
import { emailSenderFromEnv } from './email'
import { sendPending, type OutboxReport, type OutboxStore } from './send-pending'

const NOTHING: OutboxReport = { sent: 0, failed: 0, skipped: 0 }

// The notifications table through the two service-role functions.
function databaseStore(): OutboxStore | null {
  const admin = createAdminClient()
  if (!admin) return null
  return {
    async claim(limit) {
      const { data, error } = await admin.rpc('claim_notification_emails', { p_limit: limit })
      if (error) throw error
      return (data ?? []).map((row) => ({
        id: row.notification_id,
        kind: row.kind,
        data: row.data,
        link: row.link,
        email: row.email,
        playerName: row.player_name,
        clubName: row.club_name,
        clubTimezone: row.club_timezone,
        clubLogoPath: row.club_logo_path,
      }))
    },
    async finish(id, outcome) {
      const { error } = await admin.rpc('finish_notification_email', { p_id: id, p_status: outcome })
      if (error) throw error
    },
  }
}

// Mails the queued avisos. Runs after every write (revalidateBookings) and from POST
// /api/avisos/enviar, which an external cron calls every minute for what pg_cron frees.
export async function flushOutbox(): Promise<OutboxReport> {
  const store = databaseStore()
  if (!store) return NOTHING
  return sendPending(store, emailSenderFromEnv(), { siteUrl: getSiteUrl(), supabaseUrl: getSupabaseEnv().url })
}

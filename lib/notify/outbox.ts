import 'server-only'
import { clubUrl } from '@/lib/club/host'
import { isStaffRole } from '@/lib/domain/profile'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSupabaseEnv } from '@/lib/supabase/env'
import { emailSenderFromEnv } from './email'
import { buildInvitationEmail, type PendingInvitation } from './invitations'
import { mailQueue, sendPending, type MailQueue, type OutboxReport, type OutboxStore } from './send-pending'

const NOTHING: OutboxReport = { sent: 0, failed: 0, skipped: 0 }

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>

// The notifications table through the two service-role functions.
function avisoStore(admin: AdminClient): OutboxStore {
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
        clubPrimary: row.club_brand_primary,
        clubBackground: row.club_brand_background,
        clubSlug: row.club_slug,
      }))
    },
    async finish(id, outcome) {
      const { error } = await admin.rpc('finish_notification_email', { p_id: id, p_status: outcome })
      if (error) throw error
    },
  }
}

// The staff invitations (club_invitations), the same way.
function invitationStore(admin: AdminClient): MailQueue<PendingInvitation> {
  return {
    async claim(limit) {
      const { data, error } = await admin.rpc('claim_invitation_emails', { p_limit: limit })
      if (error) throw error
      return (data ?? []).flatMap((row) =>
        isStaffRole(row.role)
          ? [{
              id: row.invitation_id,
              email: row.email,
              role: row.role,
              inviterName: row.inviter_name,
              clubName: row.club_name,
              clubLogoPath: row.club_logo_path,
              clubPrimary: row.club_brand_primary,
              clubBackground: row.club_brand_background,
              clubSlug: row.club_slug,
            }]
          : [],
      )
    },
    async finish(id, outcome) {
      const { error } = await admin.rpc('finish_invitation_email', { p_id: id, p_status: outcome })
      if (error) throw error
    },
  }
}

function add(a: OutboxReport, b: OutboxReport): OutboxReport {
  return { sent: a.sent + b.sent, failed: a.failed + b.failed, skipped: a.skipped + b.skipped }
}

// Mails the queued avisos and staff invitations. Runs after every write (revalidateBookings) and from POST
// /api/avisos/enviar, which an external cron calls every minute for what pg_cron frees.
export async function flushOutbox(): Promise<OutboxReport> {
  const admin = createAdminClient()
  if (!admin) return NOTHING
  const sender = emailSenderFromEnv()
  // One job mails for every club: each link opens its own club's subdomain.
  const urls = { clubUrl: (slug: string) => clubUrl(slug), supabaseUrl: getSupabaseEnv().url }
  const avisos = await sendPending(avisoStore(admin), sender, urls)
  const invitations = await mailQueue(invitationStore(admin), sender, (item) => buildInvitationEmail(item, urls))
  return add(avisos, invitations)
}

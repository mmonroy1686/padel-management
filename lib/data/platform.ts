import 'server-only'
import type { PlatformClub } from '@/lib/domain/platform'
import { createClient } from '@/lib/supabase/server'

export async function isPlatformAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('is_platform_admin')
  if (error) throw error
  return data === true
}

// /plataforma: every club, newest first (platform_clubs, platform admins only).
export async function loadPlatformClubs(): Promise<PlatformClub[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_clubs')
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    createdAt: new Date(row.created_at),
    setupCompletedAt: row.setup_completed_at ? new Date(row.setup_completed_at) : null,
    activeCourts: row.active_courts,
    staff: row.staff,
    adminInvitationExpiresAt: row.admin_invitation_expires_at ? new Date(row.admin_invitation_expires_at) : null,
    bookingsLastWeek: row.bookings_last_week,
  }))
}

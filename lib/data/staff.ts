import 'server-only'
import { isStaffRole } from '@/lib/domain/profile'
import type { StaffInvitation, StaffMember } from '@/lib/domain/staff'
import { createClient } from '@/lib/supabase/server'

// Ajustes → Staff: the admins and reception (club_staff, admins only) and the invitations not yet accepted or
// cancelled, expired ones too (they can be resent).
export async function loadStaff(clubId: string): Promise<{ members: StaffMember[]; invitations: StaffInvitation[] }> {
  const supabase = await createClient()
  const [staff, invitations] = await Promise.all([
    supabase.rpc('club_staff', { p_club_id: clubId }),
    supabase
      .from('club_invitations')
      .select('id, email, role, expires_at')
      .eq('club_id', clubId)
      .is('accepted_at', null)
      .is('cancelled_at', null)
      .order('created_at'),
  ])
  if (staff.error) throw staff.error
  if (invitations.error) throw invitations.error
  return {
    members: (staff.data ?? []).flatMap((row) =>
      isStaffRole(row.role) ? [{ userId: row.user_id, role: row.role, displayName: row.display_name, email: row.email, support: row.support }] : [],
    ),
    invitations: invitations.data.flatMap((row) =>
      isStaffRole(row.role) ? [{ id: row.id, email: row.email, role: row.role, expiresAt: new Date(row.expires_at) }] : [],
    ),
  }
}

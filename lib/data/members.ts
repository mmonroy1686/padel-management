import 'server-only'
import type { MemberOption, MemberView } from '@/lib/domain/members'
import { createClient } from '@/lib/supabase/server'

export async function loadMemberOptions(clubId: string): Promise<MemberOption[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('club_members')
    .select('user_id, profile:profiles(display_name)')
    .eq('club_id', clubId)
  if (error) throw error
  return data
    .map((member) => ({ userId: member.user_id, name: member.profile?.display_name ?? 'Sin nombre' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

export async function loadMembers(clubId: string): Promise<MemberView[]> {
  const supabase = await createClient()
  const [members, contacts] = await Promise.all([
    supabase
      .from('club_members')
      .select('user_id, role, category, category_validated, profile:profiles(display_name, avatar_source, avatar_path, avatar_url)')
      .eq('club_id', clubId),
    // Staff only (Jugadores asks with requireStaff): the email they sign in with and their WhatsApp.
    supabase.rpc('club_member_contacts', { p_club_id: clubId }),
  ])
  if (members.error) throw members.error
  if (contacts.error) throw contacts.error
  const byUser = new Map(contacts.data.map((row) => [row.user_id, row]))
  return members.data.map((member) => {
    const contact = byUser.get(member.user_id)
    return {
      userId: member.user_id,
      name: member.profile?.display_name ?? 'Sin nombre',
      role: member.role,
      category: member.category,
      validated: member.category_validated,
      avatar: member.profile
        ? { avatar_source: member.profile.avatar_source, avatar_path: member.profile.avatar_path, avatar_url: member.profile.avatar_url }
        : null,
      email: contact?.email ?? null,
      contact: contact ? { phone: contact.phone, whatsappConsent: contact.whatsapp_consent } : null,
    }
  })
}

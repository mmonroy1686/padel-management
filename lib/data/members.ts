import 'server-only'
import type { MemberOption } from '@/lib/domain/members'
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

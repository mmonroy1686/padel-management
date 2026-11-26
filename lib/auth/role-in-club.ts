import 'server-only'
import { findClub } from '@/lib/auth/viewer'
import type { createClient } from '@/lib/supabase/server'

type ServerClient = Awaited<ReturnType<typeof createClient>>

// The signed-in person's role in this host's club (null: not a member yet, or no club on this host). Where they land
// after signing in depends on it (landingAfterSignIn).
export async function roleInClub(supabase: ServerClient): Promise<'player' | 'reception' | 'admin' | null> {
  const [{ data: auth }, club] = await Promise.all([supabase.auth.getUser(), findClub()])
  if (!auth.user || !club) return null
  const { data } = await supabase.from('club_members').select('role').eq('club_id', club.id).eq('user_id', auth.user.id).maybeSingle()
  return data?.role ?? null
}

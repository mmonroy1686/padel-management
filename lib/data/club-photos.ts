import 'server-only'
import { clubLogoUrl } from '@/lib/domain/club-logo'
import { getSupabaseEnv } from '@/lib/supabase/env'
import { createClient } from '@/lib/supabase/server'

export type ClubPhoto = { id: string; path: string; url: string }

// The club's photos in their order, the cover first. Anyone reads them: Inicio shows them before signing in too.
export async function loadClubPhotos(clubId: string): Promise<ClubPhoto[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('club_photos').select('id, path').eq('club_id', clubId).order('position')
  if (error) throw error
  const base = getSupabaseEnv().url
  return data.map((photo) => ({ ...photo, url: clubLogoUrl(base, photo.path) as string }))
}

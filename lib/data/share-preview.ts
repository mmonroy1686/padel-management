import 'server-only'
import type { Metadata } from 'next'
import { cache } from 'react'
import { getClub } from '@/lib/auth/viewer'
import { isUuid } from '@/lib/domain/input'
import { matchPreview, readMatchPreview, type SharePreview } from '@/lib/domain/share-preview'
import { createClient } from '@/lib/supabase/server'

// "Falta 1 de revés · jue 20:00" for a match still forming; null for anything else (match_preview, anon too).
export const loadMatchPreview = cache(async (matchId: string): Promise<SharePreview | null> => {
  if (!isUuid(matchId)) return null
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('match_preview', { p_match_id: matchId })
  if (error) throw error
  const preview = readMatchPreview(data)
  if (!preview) return null
  const club = await getClub()
  return matchPreview(preview, club.name, club.timezone)
})

// The title and the image WhatsApp shows for /partidos/<id>, on that page and on the sign-in page it sends a
// visitor without a session to (WhatsApp follows the redirect).
export async function matchPreviewMetadata(matchId: string): Promise<Metadata | null> {
  const preview = await loadMatchPreview(matchId)
  if (!preview) return null
  return {
    title: preview.title,
    description: preview.description,
    openGraph: { ...preview, images: [`/api/vista-previa/partido/${matchId}`] },
  }
}

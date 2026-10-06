import { checkPosterFile, POSTER_BUCKET, posterPath } from '@/lib/domain/championship-poster'
import { createClient } from '@/lib/supabase/client'
import type { UploadResult } from './receipts'

// Uploads straight from the browser to Storage; the policy only lets the club's staff write. posterPath reads
// the clock, so it is called once.
export async function uploadChampionshipPoster(clubId: string, file: File): Promise<UploadResult> {
  const problem = checkPosterFile(file)
  if (problem) return { error: problem }
  const path = posterPath(clubId, file.name)
  const { error } = await createClient()
    .storage.from(POSTER_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type })
  return error ? { error: 'No pudimos subir el afiche. Probá de nuevo.' } : { path }
}

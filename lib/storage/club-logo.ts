import { checkLogoFile, LOGO_BUCKET, logoPath } from '@/lib/domain/club-logo'
import { createClient } from '@/lib/supabase/client'
import type { UploadResult } from './receipts'

// Uploads straight from the browser to Storage; the policy only lets the club's admins write.
export async function uploadClubLogo(clubId: string, file: File): Promise<UploadResult> {
  const problem = checkLogoFile(file)
  if (problem) return { error: problem }
  const path = logoPath(clubId, file.name)
  const { error } = await createClient()
    .storage.from(LOGO_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type })
  return error ? { error: 'No pudimos subir el logo. Probá de nuevo.' } : { path }
}

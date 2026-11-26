import { AVATAR_BUCKET, avatarPath, checkAvatarFile } from '@/lib/domain/contact'
import { createClient } from '@/lib/supabase/client'
import type { UploadResult } from './receipts'

// The player's photo, straight from the browser to their own folder (the bucket's policy checks it).
export async function uploadAvatar(userId: string, file: File): Promise<UploadResult> {
  const problem = checkAvatarFile(file)
  if (problem) return { error: problem }
  const path = avatarPath(userId, file.type)
  const { error } = await createClient()
    .storage.from(AVATAR_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type })
  return error ? { error: 'No pudimos subir la foto. Probá de nuevo.' } : { path }
}

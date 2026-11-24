import { checkFlyerSource, clubPhotoPath, LOGO_BUCKET } from '@/lib/domain/club-logo'
import { createClient } from '@/lib/supabase/client'
import type { UploadResult } from './receipts'

const LONGEST_SIDE = 1600

// The size of a photo shrunk to fit LONGEST_SIDE, never enlarged.
export function shrunkSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, LONGEST_SIDE / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

async function shrink(file: File): Promise<Blob | null> {
  const bitmap = await createImageBitmap(file)
  const size = shrunkSize(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  if (!context) return null
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, size.width, size.height)
  bitmap.close()
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
}

// Shrinks a photo of the club in the browser (so it stays under the bucket's 2 MB and Inicio loads fast) and uploads
// it to the club's folder; the policy only lets the club's admins write. The same source limits as the flyer's photo.
export async function uploadClubPhoto(clubId: string, file: File, now = Date.now()): Promise<UploadResult> {
  const problem = checkFlyerSource(file)
  if (problem) return { error: problem }
  let blob: Blob | null = null
  try {
    blob = await shrink(file)
  } catch {
    blob = null
  }
  if (!blob) return { error: 'No pudimos leer la foto. Probá con otra.' }
  const path = clubPhotoPath(clubId, now)
  const { error } = await createClient()
    .storage.from(LOGO_BUCKET)
    .upload(path, blob, { upsert: false, contentType: 'image/jpeg' })
  return error ? { error: 'No pudimos subir la foto. Probá de nuevo.' } : { path }
}

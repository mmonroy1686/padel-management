import { checkFlyerSource, coverRect, flyerBackgroundPath, LOGO_BUCKET } from '@/lib/domain/club-logo'
import { createClient } from '@/lib/supabase/client'
import type { UploadResult } from './receipts'

const FLYER = { width: 1080, height: 1920 }
// The photo is first drawn this small and then stretched back to the flyer's size: the stretch is the blur, and it
// works in every browser. Where canvas filters work (not every Safari), a blur on top smooths what is left.
const SHRINK = 24
const BLUR = 'blur(28px)'
// The blur fades the edges toward transparent: drawing a little past them keeps the corners full.
const BLEED = 80

async function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
}

// The photo as the flyer's blurred background: a 1080×1920 JPG of a few dozen KB.
export async function blurForFlyer(file: File): Promise<Blob | null> {
  const bitmap = await createImageBitmap(file)
  const small = document.createElement('canvas')
  small.width = Math.round(FLYER.width / SHRINK)
  small.height = Math.round(FLYER.height / SHRINK)
  const smallContext = small.getContext('2d')
  const big = document.createElement('canvas')
  big.width = FLYER.width
  big.height = FLYER.height
  const bigContext = big.getContext('2d')
  if (!smallContext || !bigContext) return null
  const rect = coverRect(bitmap, small)
  smallContext.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height)
  bitmap.close()
  bigContext.imageSmoothingEnabled = true
  bigContext.imageSmoothingQuality = 'high'
  if ('filter' in bigContext) bigContext.filter = BLUR
  bigContext.drawImage(small, -BLEED, -BLEED, big.width + 2 * BLEED, big.height + 2 * BLEED)
  return canvasBlob(big)
}

// Blurs the photo in the browser and uploads it to the club's folder; the policy only lets the club's admins write.
export async function uploadFlyerBackground(clubId: string, file: File): Promise<UploadResult> {
  const problem = checkFlyerSource(file)
  if (problem) return { error: problem }
  let blob: Blob | null = null
  try {
    blob = await blurForFlyer(file)
  } catch {
    blob = null
  }
  if (!blob) return { error: 'No pudimos leer la foto. Probá con otra.' }
  const path = flyerBackgroundPath(clubId)
  const { error } = await createClient()
    .storage.from(LOGO_BUCKET)
    .upload(path, blob, { upsert: false, contentType: 'image/jpeg' })
  return error ? { error: 'No pudimos subir la foto. Probá de nuevo.' } : { path }
}

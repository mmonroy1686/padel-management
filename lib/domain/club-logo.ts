export const MAX_LOGO_BYTES = 2 * 1024 * 1024
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] as const
export const LOGO_BUCKET = 'club-logos'

const EXTENSION = /\.([a-z0-9]{1,5})$/i
const LOGO_FILE = /^logo-\d{1,15}\.(png|jpe?g|webp|svg)$/

// Object name inside the club-logos bucket: <club_id>/logo-<timestamp>.<ext>. The first folder is
// what the Storage policy checks; the file name only contributes its extension.
export function logoPath(clubId: string, fileName: string, now = Date.now()): string {
  const extension = EXTENSION.exec(fileName)?.[1]?.toLowerCase() ?? 'png'
  return `${clubId}/logo-${now}.${extension}`
}

// What the Ajustes action accepts: a logo of that club, named as logoPath names it.
export function isClubLogoPath(clubId: string, path: string): boolean {
  const [folder, file, ...rest] = path.split('/')
  return folder === clubId && rest.length === 0 && LOGO_FILE.test(file ?? '')
}

// The same limits as the bucket, with a message the admin understands.
export function checkLogoFile(file: { type: string; size: number }): string | null {
  if (!(LOGO_TYPES as readonly string[]).includes(file.type)) return 'Subí una imagen PNG, JPG, WebP o SVG.'
  if (file.size > MAX_LOGO_BYTES) return 'El logo pesa más de 2 MB. Probá con una versión más liviana.'
  return null
}

export function clubLogoUrl(supabaseUrl: string, path: string | null): string | null {
  return path ? `${supabaseUrl}/storage/v1/object/public/${LOGO_BUCKET}/${path}` : null
}

// The free-slots flyer's background: a photo the admin picks in Ajustes. The browser blurs it and shrinks it to a
// 1080×1920 JPG before uploading (lib/storage/flyer-background.ts), so it goes in the same bucket as the logo, in the
// club's folder: <club_id>/flyer-<timestamp>.jpg.
export const FLYER_SOURCE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const MAX_FLYER_SOURCE_BYTES = 15 * 1024 * 1024
const FLYER_FILE = /^flyer-\d{1,15}\.jpg$/

export function flyerBackgroundPath(clubId: string, now = Date.now()): string {
  return `${clubId}/flyer-${now}.jpg`
}

export function isClubFlyerBackgroundPath(clubId: string, path: string): boolean {
  const [folder, file, ...rest] = path.split('/')
  return folder === clubId && rest.length === 0 && FLYER_FILE.test(file ?? '')
}

// The photo as the admin picks it, before the browser shrinks it.
export function checkFlyerSource(file: { type: string; size: number }): string | null {
  if (!(FLYER_SOURCE_TYPES as readonly string[]).includes(file.type)) return 'Subí una foto JPG, PNG o WebP.'
  if (file.size > MAX_FLYER_SOURCE_BYTES) return 'La foto pesa más de 15 MB. Probá con una más liviana.'
  return null
}

type Size = { width: number; height: number }

// Where to draw a picture so it covers the whole box, centered, cropping what is left over (CSS object-fit: cover).
export function coverRect(image: Size, box: Size): { x: number; y: number; width: number; height: number } {
  const scale = Math.max(box.width / image.width, box.height / image.height)
  const width = image.width * scale
  const height = image.height * scale
  const round = (value: number) => Math.round(value * 100) / 100
  return { x: round((box.width - width) / 2), y: round((box.height - height) / 2), width: round(width), height: round(height) }
}

// Photos of the club for Inicio (Datos del club): the browser shrinks each to a JPG of 1600 px on its longest side
// (lib/storage/club-photo.ts), in the club's folder: <club_id>/photo-<timestamp>.jpg.
const PHOTO_FILE = /^photo-\d{1,15}\.jpg$/

export function clubPhotoPath(clubId: string, now = Date.now()): string {
  return `${clubId}/photo-${now}.jpg`
}

export function isClubPhotoPath(clubId: string, path: string): boolean {
  const [folder, file, ...rest] = path.split('/')
  return folder === clubId && rest.length === 0 && PHOTO_FILE.test(file ?? '')
}

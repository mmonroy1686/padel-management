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

export const POSTER_BUCKET = 'championship-posters'
export const MAX_POSTER_BYTES = 5 * 1024 * 1024
export const POSTER_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

const EXTENSION = /[.]([a-z0-9]{1,5})$/i
const POSTER_FILE = /^poster-[0-9]{1,15}[.](png|jpe?g|webp)$/

// Object name inside the championship-posters bucket: <club_id>/poster-<timestamp>.<ext>. The first folder is
// what the Storage policy checks; the file name only contributes its extension.
export function posterPath(clubId: string, fileName: string, now = Date.now()): string {
  const extension = EXTENSION.exec(fileName)?.[1]?.toLowerCase() ?? 'png'
  return `${clubId}/poster-${now}.${extension}`
}

// What the action accepts: a poster of that club, named as posterPath names it.
export function isPosterPath(clubId: string, path: string): boolean {
  const [folder, file, ...rest] = path.split('/')
  return folder === clubId && rest.length === 0 && POSTER_FILE.test(file ?? '')
}

// The same limits as the bucket, with a message the organizer understands.
export function checkPosterFile(file: { type: string; size: number }): string | null {
  if (!(POSTER_TYPES as readonly string[]).includes(file.type)) return 'Subí una imagen PNG, JPG o WebP.'
  if (file.size > MAX_POSTER_BYTES) return 'El afiche pesa más de 5 MB. Probá con una versión más liviana.'
  return null
}

export function championshipPosterUrl(supabaseUrl: string, path: string | null): string | null {
  return path ? `${supabaseUrl}/storage/v1/object/public/${POSTER_BUCKET}/${path}` : null
}

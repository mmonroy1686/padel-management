import { normalizePhone } from './championships'
import { internationalPhone } from './club-info'

// The player's contact and photo (feature perfil-jugador).

export type PlayerContact = { phone: string | null; whatsappConsent: boolean }
export type AvatarSource = 'upload' | 'google' | 'none'
export type ProfileAvatar = { avatar_source: AvatarSource | null; avatar_path: string | null; avatar_url: string | null }

// Up to two letters for the circle when there is no photo: first and last name ("Paula Ramírez" → "PR"), one word
// gives its first letter.
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const letters = words.length === 1 ? [words[0]] : [words[0], words[words.length - 1]]
  return letters.map((word) => word.charAt(0).toLocaleUpperCase('es')).join('')
}

// The chat with a player, from the panel: only with their consent (null otherwise), with an optional first message.
export function playerWhatsappUrl(contact: PlayerContact | null, timezone: string, text?: string): string | null {
  if (!contact?.phone || !contact.whatsappConsent) return null
  const base = `https://wa.me/${internationalPhone(contact.phone, timezone)}`
  return text ? `${base}?text=${encodeURIComponent(text)}` : base
}

type ContactResult = { ok: true; value: { phone: string; consent: boolean } } | { ok: false; message: string }

// Perfil → WhatsApp: the number as people write it (099 123 456, +598 99 123 456) and the consent box. An empty
// number clears it; consenting needs one. The database checks the same (save_player_contact).
export function parseContactForm(form: FormData): ContactResult {
  const raw = String(form.get('phone') ?? '').trim()
  const consent = form.get('whatsappConsent') === 'on'
  if (raw === '') {
    return consent
      ? { ok: false, message: 'Para aceptar mensajes, primero cargá tu WhatsApp.' }
      : { ok: true, value: { phone: '', consent: false } }
  }
  const phone = raw.length <= 30 ? normalizePhone(raw) : null
  if (!phone) return { ok: false, message: 'Revisá el número: por ejemplo 099 123 456.' }
  return { ok: true, value: { phone, consent } }
}

// The photo files: <user_id>/avatar-<timestamp>.<ext> in the avatars bucket, as set_profile_avatar accepts them.
export const AVATAR_BUCKET = 'avatars'
export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024
const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export function avatarPath(userId: string, type: string, now = Date.now()): string {
  return `${userId}/avatar-${now}.${EXTENSIONS[type] ?? 'jpg'}`
}

export function checkAvatarFile(file: { type: string; size: number }): string | null {
  if (!(AVATAR_TYPES as readonly string[]).includes(file.type)) return 'Subí una foto JPG, PNG o WebP.'
  if (file.size > MAX_AVATAR_BYTES) return 'La foto pesa más de 2 MB. Probá con una más liviana.'
  return null
}

// Which picture to show: the uploaded one, then Google's, then none (initials).
export function avatarSrc(profile: ProfileAvatar, supabaseUrl: string): string | null {
  if (profile.avatar_source === 'upload' && profile.avatar_path) {
    return `${supabaseUrl}/storage/v1/object/public/${AVATAR_BUCKET}/${profile.avatar_path}`
  }
  if (profile.avatar_source === 'google' && profile.avatar_url) return profile.avatar_url
  return null
}

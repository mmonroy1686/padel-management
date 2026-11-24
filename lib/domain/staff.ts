import { errorMessage } from './errors'
import { shortDate } from './format'
import type { ParseResult } from './settings'
import { localDateOf } from './time'

// Ajustes → Staff: the club's admins and reception, and the invitations still open.

export const STAFF_ROLES = ['admin', 'reception'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]
export const STAFF_ROLE_LABELS: Record<StaffRole, string> = { admin: 'Admin', reception: 'Recepción' }

export type StaffMember = { userId: string; role: StaffRole; displayName: string; email: string }
export type StaffInvitation = { id: string; email: string; role: StaffRole; expiresAt: Date }

// The same shape the database checks (private.normalized_email); it has the last word.
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function parseInviteForm(form: FormData): ParseResult<{ email: string; role: StaffRole }> {
  const raw = form.get('email')
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (email.length > 254 || !EMAIL.test(email)) return { ok: false, message: errorMessage('invalid_email') }
  const role = form.get('role')
  if (!(STAFF_ROLES as readonly unknown[]).includes(role)) return { ok: false, message: 'Elegí si es admin o recepción.' }
  return { ok: true, value: { email, role: role as StaffRole } }
}

// Staff who never filled in a player profile may have no name yet: their email then.
export function staffName(member: Pick<StaffMember, 'displayName' | 'email'>): string {
  return member.displayName.trim() || member.email
}

export function invitationStatus(
  invitation: StaffInvitation,
  now: Date,
  timeZone: string,
): { expired: boolean; text: string } {
  if (invitation.expiresAt <= now) return { expired: true, text: 'Vencida: reenviala para darle 7 días más' }
  return { expired: false, text: `Vence el ${shortDate(localDateOf(invitation.expiresAt, timeZone))}` }
}

// "Compartir link", for when the mail does not arrive: the invitation is accepted by signing in with that email.
export function invitationShareText(clubName: string, email: string, clubOrigin: string): string {
  return `Te invitamos al staff de ${clubName}. Entrá con ${email} acá para aceptar: ${clubOrigin}/invitacion`
}

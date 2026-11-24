'use server'

import { failed, fromRpc, INVALID_INPUT, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { getViewer } from '@/lib/auth/viewer'
import { errorMessage } from '@/lib/domain/errors'
import { readEnum, readUuid } from '@/lib/domain/input'
import { parseInviteForm, STAFF_ROLE_LABELS, STAFF_ROLES } from '@/lib/domain/staff'
import { createClient } from '@/lib/supabase/server'

// Ajustes → Staff. The functions check the admin role and the last admin again; this gives a clear message first.
// revalidateBookings also mails what was queued (the invitation) once the response is out.

const FORBIDDEN = failed(errorMessage('forbidden'))

async function adminClubId(): Promise<string | null> {
  const viewer = await getViewer()
  return viewer?.membership?.role === 'admin' ? viewer.club.id : null
}

async function run(call: Parameters<typeof fromRpc>[0] | null, message: string): Promise<ActionState> {
  const result = fromRpc(call, message)
  if (result.status === 'ok') revalidateBookings()
  return result
}

export async function inviteStaff(_previous: ActionState, form: FormData): Promise<ActionState> {
  const clubId = await adminClubId()
  if (!clubId) return FORBIDDEN
  const parsed = parseInviteForm(form)
  if (!parsed.ok) return failed(parsed.message)
  const { email, role } = parsed.value
  const supabase = await createClient()
  const { error } = await supabase.rpc('invite_staff', { p_club_id: clubId, p_email: email, p_role: role })
  return run(error, `Invitamos a ${email} como ${STAFF_ROLE_LABELS[role].toLowerCase()}. Le llega un mail para aceptar.`)
}

export async function resendInvitation(_previous: ActionState, form: FormData): Promise<ActionState> {
  if (!(await adminClubId())) return FORBIDDEN
  const id = readUuid(form, 'invitationId')
  if (!id) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('resend_staff_invitation', { p_id: id })
  return run(error, 'Reenviada: vence en 7 días.')
}

export async function cancelInvitation(_previous: ActionState, form: FormData): Promise<ActionState> {
  if (!(await adminClubId())) return FORBIDDEN
  const id = readUuid(form, 'invitationId')
  if (!id) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('cancel_staff_invitation', { p_id: id })
  return run(error, 'Invitación cancelada.')
}

export async function changeStaffRole(_previous: ActionState, form: FormData): Promise<ActionState> {
  const clubId = await adminClubId()
  if (!clubId) return FORBIDDEN
  const userId = readUuid(form, 'userId')
  const role = readEnum(form, 'role', STAFF_ROLES)
  if (!userId || !role) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_member_role', { p_club_id: clubId, p_user_id: userId, p_role: role })
  return run(error, `Ahora es ${STAFF_ROLE_LABELS[role].toLowerCase()}.`)
}

export async function removeStaff(_previous: ActionState, form: FormData): Promise<ActionState> {
  const clubId = await adminClubId()
  if (!clubId) return FORBIDDEN
  const userId = readUuid(form, 'userId')
  if (!userId) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('remove_staff', { p_club_id: clubId, p_user_id: userId })
  return run(error, 'Ya no es parte del staff. Si juega, sigue como jugador.')
}

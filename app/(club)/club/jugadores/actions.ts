'use server'

import { failed, fromRpc, INVALID_INPUT, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { getViewer } from '@/lib/auth/viewer'
import { errorMessage } from '@/lib/domain/errors'
import { readEnum, readInt, readUuid } from '@/lib/domain/input'
import { ROLES } from '@/lib/domain/profile'
import { createClient } from '@/lib/supabase/server'

export async function validateCategory(_previous: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer()
  if (!viewer) return failed(errorMessage('forbidden'))
  const userId = readUuid(form, 'userId')
  const category = readInt(form, 'category', { min: 1, max: 8 })
  if (!userId || category === null) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('validate_category', {
    p_club_id: viewer.club.id,
    p_user_id: userId,
    p_category: category,
  })
  revalidateBookings()
  return fromRpc(error, 'Categoría validada.')
}

export async function setMemberRole(_previous: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer()
  if (!viewer) return failed(errorMessage('forbidden'))
  const userId = readUuid(form, 'userId')
  const role = readEnum(form, 'role', ROLES)
  if (!userId || !role) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_member_role', { p_club_id: viewer.club.id, p_user_id: userId, p_role: role })
  revalidateBookings()
  return fromRpc(error, 'Rol actualizado.')
}

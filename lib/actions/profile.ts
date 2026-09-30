'use server'

import { redirect } from 'next/navigation'
import { failed, fromRpc, INVALID_INPUT, ok, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { safeNextPath } from '@/lib/auth/redirect'
import { getViewer } from '@/lib/auth/viewer'
import { readBoolean, readEnum, readInt, readText } from '@/lib/domain/input'
import { GENDERS, HANDS, SIDES } from '@/lib/domain/profile'
import { createClient } from '@/lib/supabase/server'

// Saves name, side, hand, gender, visibility and category in one transaction (save_my_profile), which
// also joins the club the first time.
export async function saveProfile(_previous: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer()
  if (!viewer) return failed('Tu sesión venció. Volvé a ingresar.')

  const displayName = readText(form, 'displayName', { maxLength: 60 })
  const side = readEnum(form, 'side', SIDES)
  const hand = readEnum(form, 'hand', HANDS)
  const gender = readEnum(form, 'gender', GENDERS)
  const category = readInt(form, 'category', { min: 1, max: 8 })
  if (!displayName || !side || !hand || !gender || category === null) return INVALID_INPUT

  const supabase = await createClient()
  const { error } = await supabase.rpc('save_my_profile', {
    p_club_id: viewer.club.id,
    p_display_name: displayName,
    p_side: side,
    p_hand: hand,
    p_gender: gender,
    p_is_public: readBoolean(form, 'isPublic'),
    p_category: category,
  })
  if (error) return fromRpc(error, '')

  revalidateBookings()
  const next = form.get('next')
  if (typeof next === 'string' && next) redirect(safeNextPath(next))
  return ok('Guardamos tus cambios.')
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/')
}

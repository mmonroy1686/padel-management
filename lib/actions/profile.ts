'use server'

import { redirect } from 'next/navigation'
import { failed, fromRpc, INVALID_INPUT, ok, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { safeNextPath } from '@/lib/auth/redirect'
import { getViewer } from '@/lib/auth/viewer'
import { readBoolean, readEnum, readInt, readText } from '@/lib/domain/input'
import { HANDS, SIDES } from '@/lib/domain/profile'
import { createClient } from '@/lib/supabase/server'

// Saves name, side, hand and visibility (direct update, RLS: own profile only) and, when it
// changed, the category through set_my_category, which also joins the club the first time.
export async function saveProfile(_previous: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer()
  if (!viewer) return failed('Tu sesión venció. Volvé a ingresar.')

  const displayName = readText(form, 'displayName', { maxLength: 60 })
  const side = readEnum(form, 'side', SIDES)
  const hand = readEnum(form, 'hand', HANDS)
  const category = readInt(form, 'category', { min: 1, max: 8 })
  if (!displayName || !side || !hand || category === null) return INVALID_INPUT

  const supabase = await createClient()
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ display_name: displayName, side, hand, is_public: readBoolean(form, 'isPublic') })
    .eq('id', viewer.userId)
  if (profileError) return failed('No pudimos guardar tu perfil. Probá de nuevo.')

  if (viewer.membership?.category !== category) {
    const { error } = await supabase.rpc('set_my_category', { p_club_id: viewer.club.id, p_category: category })
    if (error) return fromRpc(error, '')
  }

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

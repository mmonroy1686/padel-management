'use server'

import { redirect } from 'next/navigation'
import { failed, fromRpc, INVALID_INPUT, ok, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { getViewer } from '@/lib/auth/viewer'
import { readBoolean, readEnum, readInt, readLocalDate, readTime, readUuid } from '@/lib/domain/input'
import { isCancelReason, joinResultMessage, MATCH_TYPES, SLOT_SIDES } from '@/lib/domain/matches'
import { parseTime, zonedTime } from '@/lib/domain/time'
import { createClient } from '@/lib/supabase/server'

export async function createMatch(_previous: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer()
  if (!viewer) return failed('Tu sesión venció. Volvé a ingresar.')
  const date = readLocalDate(form, 'date')
  const time = readTime(form, 'time')
  const courtId = readUuid(form, 'courtId')
  const matchType = readEnum(form, 'matchType', MATCH_TYPES)
  const side = readEnum(form, 'side', SLOT_SIDES)
  const categoryMin = readInt(form, 'categoryMin', { min: 1, max: 8 })
  const categoryMax = readInt(form, 'categoryMax', { min: 1, max: 8 })
  if (!date || !time || !courtId || !matchType || !side || categoryMin === null || categoryMax === null) {
    return INVALID_INPUT
  }
  if (categoryMin > categoryMax) return failed('La categoría "desde" tiene que ser menor o igual que "hasta".')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_match', {
    p_court_id: courtId,
    p_starts_at: zonedTime(date, parseTime(time), viewer.club.timezone).toISOString(),
    p_allow_other_court: readBoolean(form, 'allowOtherCourt'),
    p_category_min: categoryMin,
    p_category_max: categoryMax,
    p_match_type: matchType,
    p_side: side,
  })
  if (error) return fromRpc(error, '')
  revalidateBookings()
  redirect(`/partidos/${data.id}`)
}

export async function joinMatch(_previous: ActionState, form: FormData): Promise<ActionState> {
  const matchId = readUuid(form, 'matchId')
  const position = readInt(form, 'position', { min: 1, max: 4 })
  if (!matchId || position === null) return INVALID_INPUT

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('join_match', { p_match_id: matchId, p_position: position })
  revalidateBookings()
  if (error) return fromRpc(error, '')

  let courtName: string | null = null
  if (data.court_id) {
    const court = await supabase.from('courts').select('name').eq('id', data.court_id).maybeSingle()
    courtName = court.data?.name ?? null
  }
  const cancelReason = isCancelReason(data.cancel_reason) ? data.cancel_reason : null
  return ok(joinResultMessage({ status: data.status, cancelReason }, courtName))
}

export async function leaveMatch(_previous: ActionState, form: FormData): Promise<ActionState> {
  const matchId = readUuid(form, 'matchId')
  if (!matchId) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('leave_match', { p_match_id: matchId })
  revalidateBookings()
  return fromRpc(error, 'Saliste del partido. Tu lugar quedó libre.')
}

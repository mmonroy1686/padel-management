'use server'

import { failed, ok, type CreatedState, type InviteResult } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { errorMessage } from '@/lib/domain/errors'
import { isUuid, readBoolean, readEnum, readInstant, readInt, readUuid } from '@/lib/domain/input'
import { MATCH_TYPES } from '@/lib/domain/matches'
import { createClient } from '@/lib/supabase/server'

// Same cap as public.invite_to_match.
const MAX_INVITES = 50

// Asistente → "Crear partido": the match with its four spots free. The RPC checks staff and every rule.
export async function createStaffMatch(_previous: CreatedState, form: FormData): Promise<CreatedState> {
  const courtId = readUuid(form, 'courtId')
  const startsAt = readInstant(form, 'startsAt')
  const matchType = readEnum(form, 'matchType', MATCH_TYPES)
  const categoryMin = readInt(form, 'categoryMin', { min: 1, max: 8 })
  const categoryMax = readInt(form, 'categoryMax', { min: 1, max: 8 })
  if (!courtId || !startsAt || !matchType || categoryMin === null || categoryMax === null) {
    return failed(errorMessage('invalid_input'))
  }
  if (categoryMin > categoryMax) return failed('La categoría "desde" tiene que ser menor o igual que "hasta".')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('staff_create_match', {
    p_court_id: courtId,
    p_starts_at: startsAt,
    p_allow_other_court: readBoolean(form, 'allowOtherCourt'),
    p_category_min: categoryMin,
    p_category_max: categoryMax,
    p_match_type: matchType,
  })
  if (error) return failed(errorMessage(error.message))
  revalidateBookings()
  return { ...ok('Partido creado con los 4 lugares libres. Invitá a los que suelen jugar.'), matchId: data.id }
}

// Asistente → "Invitar": an aviso and a mail to each player (the outbox mails it after the response).
export async function inviteToMatch(matchId: string, playerIds: string[]): Promise<InviteResult> {
  if (!isUuid(matchId) || !Array.isArray(playerIds) || playerIds.length === 0 || playerIds.length > MAX_INVITES || !playerIds.every(isUuid)) {
    return { ok: false, message: errorMessage('invalid_input') }
  }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('invite_to_match', { p_match_id: matchId, p_player_ids: playerIds })
  if (error) return { ok: false, message: errorMessage(error.message) }
  revalidateBookings()
  return { ok: true, invited: data }
}

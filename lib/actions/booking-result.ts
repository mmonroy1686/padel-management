'use server'

import { revalidatePath } from 'next/cache'
import { failed, fromRpc, INVALID_INPUT, type ActionState } from '@/lib/actions/result'
import { parseResultForm } from '@/lib/domain/booking-result'
import { readUuid } from '@/lib/domain/input'
import { createClient } from '@/lib/supabase/server'

// A played booking's result, from the player's history or the club's grid: save_booking_result checks who writes.
export async function saveBookingResult(_previous: ActionState, form: FormData): Promise<ActionState> {
  const parsed = parseResultForm(form)
  if (!parsed.ok) return failed(parsed.message)
  const { bookingId, teamA, gamesA, gamesB } = parsed.value
  const supabase = await createClient()
  const { error } = await supabase.rpc('save_booking_result', {
    p_booking_id: bookingId,
    p_team_a: teamA,
    p_games_a: gamesA,
    p_games_b: gamesB,
  })
  const result = fromRpc(error, 'Resultado guardado.')
  if (result.status === 'ok') revalidate()
  return result
}

export async function clearBookingResult(_previous: ActionState, form: FormData): Promise<ActionState> {
  const bookingId = readUuid(form, 'bookingId')
  if (!bookingId) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('clear_booking_result', { p_booking_id: bookingId })
  const result = fromRpc(error, 'Resultado borrado.')
  if (result.status === 'ok') revalidate()
  return result
}

function revalidate() {
  revalidatePath('/perfil', 'layout')
  revalidatePath('/club/grilla')
}

'use server'

import { fromRpc, INVALID_INPUT, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { readInstant, readUuid } from '@/lib/domain/input'
import { createClient } from '@/lib/supabase/server'

export async function bookSlot(_previous: ActionState, form: FormData): Promise<ActionState> {
  const courtId = readUuid(form, 'courtId')
  const startsAt = readInstant(form, 'startsAt')
  if (!courtId || !startsAt) return INVALID_INPUT

  const supabase = await createClient()
  const { error } = await supabase.rpc('book_slot', { p_court_id: courtId, p_starts_at: startsAt })
  // Refresh even on error: after slot_taken the grid has to show the court as taken.
  revalidateBookings()
  return fromRpc(error, 'Listo, reservaste la cancha. La ves en Mis reservas.')
}

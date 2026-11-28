'use server'

import { revalidatePath } from 'next/cache'
import { fromRpc, INVALID_INPUT, type ActionState } from '@/lib/actions/result'
import { readUuid } from '@/lib/domain/input'
import { createClient } from '@/lib/supabase/server'

// "Me sumo": join_booking checks the club, the room and that it has not started; the holder gets an aviso.
export async function joinBooking(_previous: ActionState, form: FormData): Promise<ActionState> {
  const bookingId = readUuid(form, 'bookingId')
  if (!bookingId) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('join_booking', { p_booking_id: bookingId })
  const result = fromRpc(error, 'Listo, estás en el turno. Le avisamos a quien reservó.')
  if (result.status === 'ok') {
    revalidatePath(`/turno/${bookingId}`)
    revalidatePath('/')
  }
  return result
}

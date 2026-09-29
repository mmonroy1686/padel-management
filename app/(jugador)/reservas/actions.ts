'use server'

import { fromRpc, INVALID_INPUT, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { isUuid, readUuid } from '@/lib/domain/input'
import { createClient } from '@/lib/supabase/server'

export async function cancelMyBooking(_previous: ActionState, form: FormData): Promise<ActionState> {
  const bookingId = readUuid(form, 'bookingId')
  if (!bookingId) return INVALID_INPUT

  const supabase = await createClient()
  const { error } = await supabase.rpc('cancel_my_booking', { p_booking_id: bookingId })
  revalidateBookings()
  return fromRpc(error, 'Cancelaste la reserva. La cancha quedó libre.')
}

// Called after the browser uploaded the receipt; report_transfer checks the path is hers.
export async function reportTransfer(bookingId: string, receiptPath: string | null): Promise<ActionState> {
  if (!isUuid(bookingId)) return INVALID_INPUT
  if (receiptPath !== null && (typeof receiptPath !== 'string' || receiptPath.length > 300)) return INVALID_INPUT

  const supabase = await createClient()
  const { error } = await supabase.rpc('report_transfer', {
    p_booking_id: bookingId,
    p_receipt_path: receiptPath ?? undefined,
  })
  revalidateBookings()
  return fromRpc(error, 'Listo, le avisamos al club. Te confirma el pago cuando lo vea.')
}

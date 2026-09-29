'use server'

import { fromRpc, INVALID_INPUT, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { readText, readUuid } from '@/lib/domain/input'
import { createClient } from '@/lib/supabase/server'

export async function confirmPayment(_previous: ActionState, form: FormData): Promise<ActionState> {
  const paymentId = readUuid(form, 'paymentId')
  if (!paymentId) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('confirm_payment', { p_payment_id: paymentId })
  revalidateBookings()
  return fromRpc(error, 'Pago confirmado.')
}

export async function rejectPayment(_previous: ActionState, form: FormData): Promise<ActionState> {
  const paymentId = readUuid(form, 'paymentId')
  if (!paymentId) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('reject_payment', {
    p_payment_id: paymentId,
    p_reason: readText(form, 'reason', { maxLength: 120 }) ?? undefined,
  })
  revalidateBookings()
  return fromRpc(error, 'Transferencia rechazada. El jugador ve el motivo.')
}

export async function refundPayment(_previous: ActionState, form: FormData): Promise<ActionState> {
  const paymentId = readUuid(form, 'paymentId')
  if (!paymentId) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('refund_payment', { p_payment_id: paymentId })
  revalidateBookings()
  return fromRpc(error, 'Devolución registrada.')
}

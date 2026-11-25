'use server'

import { failed, fromRpc, INVALID_INPUT, ok, type ActionState } from '@/lib/actions/result'
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

// "Confirmar las marcadas": the same confirm_payment, one transfer at a time. One that fails (someone else just
// rejected it) does not stop the rest; the message says how many went through.
export async function confirmPayments(_previous: ActionState, form: FormData): Promise<ActionState> {
  const ids = [...new Set(form.getAll('paymentId'))]
  if (ids.length === 0 || ids.length > 100 || ids.some((id) => typeof id !== 'string' || !UUID.test(id))) return INVALID_INPUT
  const supabase = await createClient()
  let confirmed = 0
  for (const id of ids as string[]) {
    const { error } = await supabase.rpc('confirm_payment', { p_payment_id: id })
    if (!error) confirmed += 1
  }
  revalidateBookings()
  if (confirmed === 0) return failed('No pudimos confirmar ninguna. Recargá la página y probá de nuevo.')
  const done = confirmed === 1 ? '1 transferencia confirmada' : `${confirmed} transferencias confirmadas`
  const missed = ids.length - confirmed
  if (missed === 0) return ok(`${done}.`)
  return ok(`${done}. ${missed === 1 ? '1 ya no estaba' : `${missed} ya no estaban`} por confirmar.`)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

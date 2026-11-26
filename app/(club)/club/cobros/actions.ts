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

// "Anular cobro" / "Deshacer": a cash or POS charge of today, taken back. The debt is owed again.
export async function voidPayment(_previous: ActionState, form: FormData): Promise<ActionState> {
  const paymentId = readUuid(form, 'paymentId')
  if (!paymentId) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('void_desk_payment', { p_payment_id: paymentId })
  revalidateBookings()
  return fromRpc(error, 'Cobro anulado. Vuelve a figurar como deuda.')
}

// "Deshacer" after charging several debts at once: every payment it made, voided together or not at all
// (void_desk_payments, one transaction).
export async function voidPayments(_previous: ActionState, form: FormData): Promise<ActionState> {
  const ids = [...new Set(form.getAll('paymentId'))].map(String)
  if (ids.length === 0 || ids.length > 50 || ids.some((id) => !UUID.test(id))) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('void_desk_payments', { p_payment_ids: ids })
  revalidateBookings()
  return fromRpc(error, ids.length === 1 ? 'Cobro anulado. Vuelve a figurar como deuda.' : `Cobros anulados (${ids.length}). Vuelven a figurar como deuda.`)
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

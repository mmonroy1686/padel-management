'use server'

import { redirect } from 'next/navigation'
import { fromRpc, INVALID_INPUT, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { isUuid, readLocalDate, readUuid } from '@/lib/domain/input'
import { createClient } from '@/lib/supabase/server'

// useReward comes from a hidden input: "true" or "false", nothing else.
export async function buyDayUse(_previous: ActionState, form: FormData): Promise<ActionState> {
  const productId = readUuid(form, 'productId')
  const date = readLocalDate(form, 'date')
  const useReward = form.get('useReward')
  if (!productId || !date || (useReward !== 'true' && useReward !== 'false')) return INVALID_INPUT
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('buy_day_use', {
    p_product_id: productId,
    p_date: date,
    p_use_reward: useReward === 'true',
  })
  if (error) return fromRpc(error, '')
  revalidateBookings()
  redirect(`/day-use/pase/${data.id}`)
}

export async function cancelMyPass(_previous: ActionState, form: FormData): Promise<ActionState> {
  const passId = readUuid(form, 'passId')
  if (!passId) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('cancel_day_use', { p_pass_id: passId })
  revalidateBookings()
  return fromRpc(error, 'Pase cancelado. Si usaste tu recompensa, la recuperaste; si pagaste, el club te devuelve la plata.')
}

// Called after the browser uploaded the receipt; report_day_use_transfer checks the path is hers.
export async function reportPassTransfer(passId: string, receiptPath: string | null): Promise<ActionState> {
  if (!isUuid(passId)) return INVALID_INPUT
  if (receiptPath !== null && (typeof receiptPath !== 'string' || receiptPath.length > 300)) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('report_day_use_transfer', {
    p_pass_id: passId,
    p_receipt_path: receiptPath ?? undefined,
  })
  revalidateBookings()
  return fromRpc(error, 'Listo, le avisamos al club. Te confirma el pago cuando lo vea.')
}

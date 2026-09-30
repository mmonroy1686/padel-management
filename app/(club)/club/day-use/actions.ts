'use server'

import { failed, fromRpc, INVALID_INPUT, ok, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { getViewer } from '@/lib/auth/viewer'
import { skippedNotice } from '@/lib/domain/day-use'
import { parseProductForm } from '@/lib/domain/day-use-form'
import { readBoolean, readInt, readLocalDate, readText, readUuid } from '@/lib/domain/input'
import { createClient } from '@/lib/supabase/server'

type Supabase = Awaited<ReturnType<typeof createClient>>
type RpcCall = PromiseLike<{ error: { message: string } | null }>

// The database checks the caller is staff (or admin, for the configuration); these only check the
// shape of what comes in.
async function run(call: (supabase: Supabase) => RpcCall, okMessage: string): Promise<ActionState> {
  const supabase = await createClient()
  const { error } = await call(supabase)
  revalidateBookings()
  return fromRpc(error, okMessage)
}

async function onPass(
  form: FormData,
  call: (supabase: Supabase, passId: string) => RpcCall,
  okMessage: string,
): Promise<ActionState> {
  const passId = readUuid(form, 'passId')
  if (!passId) return INVALID_INPUT
  return run((supabase) => call(supabase, passId), okMessage)
}

// "true" or "false" from a hidden input; anything else is null.
function readFlag(form: FormData, name: string): boolean | null {
  const value = form.get(name)
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

// To a member (who may use her reward) or to a name, like the holder fields of the grid.
export async function sellDayUse(_previous: ActionState, form: FormData): Promise<ActionState> {
  const productId = readUuid(form, 'productId')
  const date = readLocalDate(form, 'date')
  const holder = form.get('holder')
  const playerId = holder === 'player' ? readUuid(form, 'playerId') : null
  const guestName = holder === 'guest' ? readText(form, 'guestName', { maxLength: 60 }) : null
  if (!productId || !date || (playerId === null) === (guestName === null)) return INVALID_INPUT
  return run(
    (supabase) =>
      supabase.rpc('sell_day_use', {
        p_product_id: productId,
        p_date: date,
        p_player_id: playerId ?? undefined,
        p_guest_name: guestName ?? undefined,
        p_use_reward: playerId !== null && readBoolean(form, 'useReward'),
      }),
    'Pase vendido.',
  )
}

export async function checkInPass(_previous: ActionState, form: FormData): Promise<ActionState> {
  return onPass(form, (supabase, id) => supabase.rpc('check_in_day_use', { p_pass_id: id }), 'Ingreso registrado.')
}

export async function cancelPass(_previous: ActionState, form: FormData): Promise<ActionState> {
  return onPass(
    form,
    (supabase, id) => supabase.rpc('cancel_day_use', { p_pass_id: id }),
    'Pase cancelado. Si había pagado, aparece en Cobros para devolver.',
  )
}

export async function recordPassCash(_previous: ActionState, form: FormData): Promise<ActionState> {
  const amount = readInt(form, 'amount', { min: 1, max: 10_000_000 })
  if (amount === null) return INVALID_INPUT
  return onPass(
    form,
    (supabase, id) => supabase.rpc('record_day_use_cash', { p_pass_id: id, p_amount: amount }),
    'Pago en efectivo registrado.',
  )
}

export async function saveDayUseProduct(_previous: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer()
  if (!viewer) return failed('Tu sesión venció. Volvé a ingresar.')
  const hasId = form.get('productId') !== null
  const productId = readUuid(form, 'productId')
  if (hasId && !productId) return INVALID_INPUT
  const parsed = parseProductForm(form)
  if (!parsed.ok) return failed(parsed.message)
  const input = parsed.value

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('save_day_use_product', {
    p_club_id: viewer.club.id,
    p_name: input.name,
    p_price: input.price,
    p_includes: input.includes,
    p_weekdays: input.weekdays,
    p_from_time: input.fromTime,
    p_to_time: input.toTime,
    p_capacity: input.capacity,
    p_court_ids: input.courtIds,
    p_sort_order: input.sortOrder,
    p_product_id: productId ?? undefined,
  })
  revalidateBookings()
  if (error) return fromRpc(error, '')
  return ok(`Pase guardado.${skippedNotice(data?.[0]?.skipped_count ?? 0)}`)
}

export async function setProductActive(_previous: ActionState, form: FormData): Promise<ActionState> {
  const productId = readUuid(form, 'productId')
  const active = readFlag(form, 'active')
  if (!productId || active === null) return INVALID_INPUT
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('set_day_use_product_active', { p_product_id: productId, p_active: active })
  revalidateBookings()
  if (error) return fromRpc(error, '')
  if (!active) return ok('Pase desactivado: ya no se vende y sus canchas quedaron libres. Los pases vendidos siguen valiendo.')
  return ok(`Pase activado.${skippedNotice(typeof data === 'number' ? data : 0)}`)
}

export async function setDayUseOverride(_previous: ActionState, form: FormData): Promise<ActionState> {
  const productId = readUuid(form, 'productId')
  const date = readLocalDate(form, 'date')
  const enabled = readFlag(form, 'enabled')
  if (!productId || !date || enabled === null) return INVALID_INPUT
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('set_day_use_override', { p_product_id: productId, p_date: date, p_enabled: enabled })
  revalidateBookings()
  if (error) return fromRpc(error, '')
  if (!enabled) return ok('Ese día no hay day use. Los pases vendidos siguen valiendo.')
  return ok(`Ese día hay day use.${skippedNotice(typeof data === 'number' ? data : 0)}`)
}

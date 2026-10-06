'use server'

import { failed, fromRpc, INVALID_INPUT, ok, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { parseRegisterForm, parseUnavailabilityForm } from '@/lib/domain/championship-form'
import { errorMessage } from '@/lib/domain/errors'
import { isUuid, readUuid } from '@/lib/domain/input'
import { createClient } from '@/lib/supabase/server'

// "Anotarme": the category, the category she plays and her partner (a member or someone from outside).
export async function registerPair(_previous: ActionState, form: FormData): Promise<ActionState> {
  const parsed = parseRegisterForm(form)
  if (!parsed.ok) return failed(parsed.message)
  const { categoryId, myLevel, partner } = parsed.value
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('register_championship_pair', {
    p_category_id: categoryId,
    p_my_level: myLevel,
    p_partner_level: partner.level,
    ...(partner.kind === 'member'
      ? { p_partner_profile_id: partner.profileId }
      : { p_partner_name: partner.name, p_partner_phone: partner.phone }),
  })
  revalidateBookings()
  if (error) return failed(errorMessage(error.message))
  return ok(
    data.status === 'waiting'
      ? 'Quedaron en la lista de espera. Si se libera un lugar, entran solos y te avisamos.'
      : 'Listo, quedaron anotados. Pagá la inscripción cuando quieras desde acá.',
  )
}

// "Darme de baja": the whole pair leaves; the first in line gets the place.
export async function withdrawEntry(_previous: ActionState, form: FormData): Promise<ActionState> {
  const entryId = readUuid(form, 'entryId')
  if (!entryId) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('withdraw_championship_entry', { p_entry_id: entryId })
  revalidateBookings()
  return fromRpc(error, 'Se dieron de baja. Si ya habían pagado, el club les devuelve la plata.')
}

// "Horarios imposibles", for a player of the pair or for staff (the database decides what each may save).
export async function saveUnavailability(_previous: ActionState, form: FormData): Promise<ActionState> {
  const parsed = parseUnavailabilityForm(form)
  if (!parsed.ok) return failed(parsed.message)
  const { entryId, blocks, note } = parsed.value
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_entry_unavailability', {
    p_entry_id: entryId,
    p_blocks: blocks,
    ...(note ? { p_note: note } : {}),
  })
  revalidateBookings()
  return fromRpc(error, 'Horarios guardados.')
}

// Called after the browser uploaded the receipt; report_championship_transfer checks the path is hers.
export async function reportChampionshipTransfer(entryId: string, receiptPath: string | null): Promise<ActionState> {
  if (!isUuid(entryId)) return INVALID_INPUT
  if (receiptPath !== null && (typeof receiptPath !== 'string' || receiptPath.length > 300)) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('report_championship_transfer', {
    p_entry_id: entryId,
    p_receipt_path: receiptPath ?? undefined,
  })
  revalidateBookings()
  return fromRpc(error, 'Listo, le avisamos al club. Te confirma el pago cuando lo vea.')
}

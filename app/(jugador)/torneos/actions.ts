'use server'

import { failed, fromRpc, INVALID_INPUT, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { isUuid, readUuid } from '@/lib/domain/input'
import { createClient } from '@/lib/supabase/server'

// With fixed pairs she signs up with a partner (partnerId) or alone, looking for one (pairing: "seeking").
export async function joinTournament(_previous: ActionState, form: FormData): Promise<ActionState> {
  const tournamentId = readUuid(form, 'tournamentId')
  if (!tournamentId) return INVALID_INPUT
  const withPartner = form.get('pairing') === 'partner'
  const partnerId = withPartner ? readUuid(form, 'partnerId') : null
  if (withPartner && !partnerId) return failed('Elegí a tu compañero.')
  const supabase = await createClient()
  const { error } = partnerId
    ? await supabase.rpc('join_tournament_pair', { p_tournament_id: tournamentId, p_partner_id: partnerId })
    : await supabase.rpc('join_tournament', { p_tournament_id: tournamentId })
  revalidateBookings()
  const paying = 'Pagá cuando quieras: queda en tu inscripción.'
  if (partnerId) return fromRpc(error, `Listo, están anotados. Le avisamos a tu compañero. ${paying}`)
  if (form.get('pairing') === 'seeking') return fromRpc(error, `Listo, estás anotado buscando pareja: el club te junta con alguien. ${paying}`)
  return fromRpc(error, `Listo, estás anotado. ${paying}`)
}

export async function leaveTournament(_previous: ActionState, form: FormData): Promise<ActionState> {
  const tournamentId = readUuid(form, 'tournamentId')
  if (!tournamentId) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('leave_tournament', { p_tournament_id: tournamentId })
  revalidateBookings()
  return fromRpc(error, 'Te diste de baja. Tu lugar quedó libre. Si ya habías pagado, el club te lo devuelve.')
}

// Called after the browser uploaded the receipt; report_tournament_transfer checks the path is hers.
export async function reportTournamentTransfer(entryId: string, receiptPath: string | null): Promise<ActionState> {
  if (!isUuid(entryId)) return INVALID_INPUT
  if (receiptPath !== null && (typeof receiptPath !== 'string' || receiptPath.length > 300)) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('report_tournament_transfer', {
    p_entry_id: entryId,
    p_receipt_path: receiptPath ?? undefined,
  })
  revalidateBookings()
  return fromRpc(error, 'Listo, le avisamos al club. Te confirma el pago cuando lo vea.')
}

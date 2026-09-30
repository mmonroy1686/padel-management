'use server'

import { fromRpc, INVALID_INPUT, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { isUuid, readUuid } from '@/lib/domain/input'
import { createClient } from '@/lib/supabase/server'

export async function joinTournament(_previous: ActionState, form: FormData): Promise<ActionState> {
  const tournamentId = readUuid(form, 'tournamentId')
  if (!tournamentId) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('join_tournament', { p_tournament_id: tournamentId })
  revalidateBookings()
  return fromRpc(error, 'Listo, estás anotado. Pagá cuando quieras: queda en tu inscripción.')
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

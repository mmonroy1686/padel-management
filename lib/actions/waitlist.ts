'use server'

import { failed, fromRpc, INVALID_INPUT, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { getViewer } from '@/lib/auth/viewer'
import { isUuid, readLocalDate, readTime, readUuid } from '@/lib/domain/input'
import { createClient } from '@/lib/supabase/server'

// "Avisame si se libera": a date, a range of the grid and at least one court (every court picked is
// stored as any court by create_slot_wait).
export async function createSlotWait(_previous: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer()
  if (!viewer) return failed('Tu sesión venció. Volvé a ingresar.')
  const date = readLocalDate(form, 'date')
  const fromTime = readTime(form, 'fromTime')
  const toTime = readTime(form, 'toTime')
  const picked = form.getAll('courtIds')
  const courtIds = picked.filter(isUuid).map((id) => id.toLowerCase())
  if (
    !date ||
    !fromTime ||
    !toTime ||
    fromTime >= toTime ||
    courtIds.length === 0 ||
    courtIds.length !== picked.length ||
    courtIds.length > 20
  ) {
    return INVALID_INPUT
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('create_slot_wait', {
    p_club_id: viewer.club.id,
    p_date: date,
    p_from: fromTime,
    p_to: toTime,
    p_court_ids: courtIds,
  })
  revalidateBookings()
  return fromRpc(error, 'Listo, te anotamos. Si se libera un turno, te lo guardamos unos minutos y te avisamos acá y por mail.')
}

export async function cancelSlotWait(_previous: ActionState, form: FormData): Promise<ActionState> {
  const waitId = readUuid(form, 'waitId')
  if (!waitId) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('cancel_slot_wait', { p_wait_id: waitId })
  revalidateBookings()
  return fromRpc(error, 'Cancelaste la espera.')
}

// "Reservar" on the banner: the held slot becomes her booking, to pay like any other.
export async function claimSlotHold(_previous: ActionState, form: FormData): Promise<ActionState> {
  const holdId = readUuid(form, 'holdId')
  if (!holdId) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('claim_slot_hold', { p_hold_id: holdId })
  revalidateBookings()
  return fromRpc(error, 'Listo, reservaste la cancha. La ves en Tus reservas.')
}

// "No me sirve": the slot goes to the next in line.
export async function declineSlotHold(_previous: ActionState, form: FormData): Promise<ActionState> {
  const holdId = readUuid(form, 'holdId')
  if (!holdId) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('decline_slot_hold', { p_hold_id: holdId })
  revalidateBookings()
  return fromRpc(error, 'Listo, se lo pasamos al siguiente de la lista.')
}

// Called by /avisos once it is open; the bell goes quiet on the next render.
export async function markNotificationsRead(): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('mark_notifications_read')
  if (!error) revalidateBookings()
}

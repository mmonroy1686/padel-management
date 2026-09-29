'use server'

import { fromRpc, INVALID_INPUT, ok, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { readEnum, readInstant, readInt, readLocalDate, readText, readTime, readUuid } from '@/lib/domain/input'
import { seriesCreatedMessage } from '@/lib/domain/series'
import { weekdayOf } from '@/lib/domain/time'
import { createClient } from '@/lib/supabase/server'

const LOAD_KINDS = ['booking', 'series', 'block'] as const

function readHolder(form: FormData): { p_player_id: string } | { p_guest_name: string } | null {
  if (form.get('holder') === 'player') {
    const playerId = readUuid(form, 'playerId')
    return playerId ? { p_player_id: playerId } : null
  }
  const guestName = readText(form, 'guestName', { maxLength: 60 })
  return guestName ? { p_guest_name: guestName } : null
}

export async function loadSlot(_previous: ActionState, form: FormData): Promise<ActionState> {
  const kind = readEnum(form, 'kind', LOAD_KINDS)
  const courtId = readUuid(form, 'courtId')
  const startsAt = readInstant(form, 'startsAt')
  if (!kind || !courtId || !startsAt) return INVALID_INPUT
  const supabase = await createClient()

  if (kind === 'block') {
    const endsAt = readInstant(form, 'endsAt')
    if (!endsAt) return INVALID_INPUT
    const { error } = await supabase.rpc('block_court', {
      p_court_id: courtId,
      p_starts_at: startsAt,
      p_ends_at: endsAt,
      p_note: readText(form, 'note', { maxLength: 80 }) ?? undefined,
    })
    revalidateBookings()
    return fromRpc(error, 'Bloqueo cargado.')
  }

  if (kind === 'series') {
    const date = readLocalDate(form, 'date')
    const startTime = readTime(form, 'startTime')
    const holder = readHolder(form)
    const endsOnRaw = form.get('endsOn')
    const endsOn = endsOnRaw ? readLocalDate(form, 'endsOn') : null
    if (!date || !startTime || !holder || (endsOnRaw && !endsOn)) return INVALID_INPUT
    const { data, error } = await supabase.rpc('create_series', {
      p_court_id: courtId,
      p_weekday: weekdayOf(date),
      p_start_time: startTime,
      p_starts_on: date,
      p_ends_on: endsOn ?? undefined,
      ...holder,
    })
    revalidateBookings()
    if (error) return fromRpc(error, '')
    return ok(seriesCreatedMessage(data ?? []))
  }

  const holder = readHolder(form)
  if (!holder) return INVALID_INPUT
  const { error } = await supabase.rpc('staff_book', { p_court_id: courtId, p_starts_at: startsAt, ...holder })
  revalidateBookings()
  return fromRpc(error, 'Reserva cargada.')
}

export async function cancelBooking(_previous: ActionState, form: FormData): Promise<ActionState> {
  const bookingId = readUuid(form, 'bookingId')
  if (!bookingId) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('cancel_booking', { p_booking_id: bookingId })
  revalidateBookings()
  return fromRpc(error, 'Reserva cancelada. La cancha quedó libre.')
}

export async function unblockCourt(_previous: ActionState, form: FormData): Promise<ActionState> {
  const occupancyId = readUuid(form, 'occupancyId')
  if (!occupancyId) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('unblock', { p_occupancy_id: occupancyId })
  revalidateBookings()
  return fromRpc(error, 'Cancha liberada.')
}

export async function recordCash(_previous: ActionState, form: FormData): Promise<ActionState> {
  const bookingId = readUuid(form, 'bookingId')
  const amount = readInt(form, 'amount', { min: 1, max: 10_000_000 })
  if (!bookingId || amount === null) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('record_cash', { p_booking_id: bookingId, p_amount: amount })
  revalidateBookings()
  return fromRpc(error, 'Pago en efectivo registrado.')
}

export async function endSeries(_previous: ActionState, form: FormData): Promise<ActionState> {
  const seriesId = readUuid(form, 'seriesId')
  const fromDate = readLocalDate(form, 'fromDate')
  if (!seriesId || !fromDate) return INVALID_INPUT
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('end_series', { p_series_id: seriesId, p_from_date: fromDate })
  revalidateBookings()
  if (error) return fromRpc(error, '')
  return ok(data === 1 ? 'Turno fijo terminado. Cancelamos 1 reserva.' : `Turno fijo terminado. Cancelamos ${data} reservas.`)
}

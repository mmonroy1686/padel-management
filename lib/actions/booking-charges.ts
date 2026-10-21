'use server'

import { failed, INVALID_INPUT, ok, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { errorMessage } from '@/lib/domain/errors'
import { formatPrice } from '@/lib/domain/format'
import { readEnum, readInt, readText, readUuid } from '@/lib/domain/input'
import { createClient } from '@/lib/supabase/server'

// The players and charges of a booking, from the Inicio and from the Grilla. The rules live in Postgres
// (set_booking_players, charge_booking_share, charge_booking_rest); these only read the form.

const METHODS = ['cash', 'transfer'] as const
const HOW = { cash: 'en efectivo', transfer: 'por transferencia' } as const

// To reception, already_paid means someone else charged it a moment ago.
function staffError(code: string, alreadyPaid: string): ActionState {
  return failed(code === 'already_paid' ? alreadyPaid : errorMessage(code))
}

function readCharge(form: FormData) {
  return { bookingId: readUuid(form, 'bookingId'), method: readEnum(form, 'method', METHODS) }
}

// "Cobrar $400" → Efectivo / Me transfirió.
export async function chargeShare(_previous: ActionState, form: FormData): Promise<ActionState> {
  const { bookingId, method } = readCharge(form)
  const position = readInt(form, 'position', { min: 1, max: 4 })
  if (!bookingId || !method || position === null) return INVALID_INPUT
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('charge_booking_share', {
    p_booking_id: bookingId,
    p_position: position,
    p_method: method,
  })
  revalidateBookings()
  if (error) return staffError(error.message, 'Ya estaba pagado.')
  return ok(`Cobramos ${formatPrice(data?.amount ?? 0)} ${HOW[method]}.`)
}

// "Cobrar todo lo que falta".
export async function chargeRest(_previous: ActionState, form: FormData): Promise<ActionState> {
  const { bookingId, method } = readCharge(form)
  if (!bookingId || !method) return INVALID_INPUT
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('charge_booking_rest', { p_booking_id: bookingId, p_method: method })
  revalidateBookings()
  if (error) return staffError(error.message, 'Ya estaba pagado.')
  const amount = (data ?? []).reduce((sum, payment) => sum + payment.amount, 0)
  return ok(`Cobramos ${formatPrice(amount)} ${HOW[method]}.`)
}

type PlayerInput = { position: number; player_id: string } | { position: number; name: string }

// "Completar jugadores": player{2,3,4}Id (a member) or player{2,3,4}Name (just a name); both empty = nobody.
export async function saveBookingPlayers(_previous: ActionState, form: FormData): Promise<ActionState> {
  const bookingId = readUuid(form, 'bookingId')
  if (!bookingId) return INVALID_INPUT
  const players: PlayerInput[] = []
  for (const position of [2, 3, 4]) {
    const idField = `player${position}Id`
    const nameField = `player${position}Name`
    const rawId = String(form.get(idField) ?? '').trim()
    const rawName = String(form.get(nameField) ?? '').trim()
    if (rawId !== '') {
      const playerId = readUuid(form, idField)
      if (!playerId) return INVALID_INPUT
      players.push({ position, player_id: playerId })
    } else if (rawName !== '') {
      const name = readText(form, nameField, { maxLength: 60 })
      if (!name) return INVALID_INPUT
      players.push({ position, name })
    }
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_booking_players', { p_booking_id: bookingId, p_players: players })
  revalidateBookings()
  if (error) return staffError(error.message, 'Ese jugador ya pagó: no se puede cambiar ni sacar.')
  return ok('Jugadores guardados.')
}

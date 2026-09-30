'use server'

import { redirect } from 'next/navigation'
import { failed, fromRpc, INVALID_INPUT, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { getViewer } from '@/lib/auth/viewer'
import { readInt, readText, readUuid } from '@/lib/domain/input'
import { parseTournamentForm } from '@/lib/domain/tournament-form'
import { createClient } from '@/lib/supabase/server'

type Supabase = Awaited<ReturnType<typeof createClient>>
type RpcCall = PromiseLike<{ error: { message: string } | null }>

// The database checks the caller is staff; these only check the shape of what comes in.
async function run(call: (supabase: Supabase) => RpcCall, okMessage: string): Promise<ActionState> {
  const supabase = await createClient()
  const { error } = await call(supabase)
  revalidateBookings()
  return fromRpc(error, okMessage)
}

async function onTournament(
  form: FormData,
  call: (supabase: Supabase, tournamentId: string) => RpcCall,
  okMessage: string,
): Promise<ActionState> {
  const tournamentId = readUuid(form, 'tournamentId')
  if (!tournamentId) return INVALID_INPUT
  return run((supabase) => call(supabase, tournamentId), okMessage)
}

export async function createTournament(_previous: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer()
  if (!viewer) return failed('Tu sesión venció. Volvé a ingresar.')
  const parsed = parseTournamentForm(form, viewer.club.timezone)
  if (!parsed.ok) return failed(parsed.message)
  const input = parsed.value

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_tournament', {
    p_name: input.name,
    p_starts_at: input.startsAt,
    p_court_ids: input.courtIds,
    p_max_players: input.maxPlayers,
    p_points_per_game: input.pointsPerGame,
    p_round_minutes: input.roundMinutes,
    p_rounds: input.rounds,
    p_category_min: input.categoryMin,
    p_category_max: input.categoryMax,
    p_type: input.type,
    p_price: input.price,
  })
  if (error) return fromRpc(error, '')
  revalidateBookings()
  redirect(`/club/torneos/${data.id}`)
}

export async function closeRegistration(_previous: ActionState, form: FormData): Promise<ActionState> {
  return onTournament(
    form,
    (supabase, id) => supabase.rpc('close_tournament_registration', { p_tournament_id: id }),
    'Inscripción cerrada. Podés reabrirla hasta armar el fixture.',
  )
}

export async function reopenRegistration(_previous: ActionState, form: FormData): Promise<ActionState> {
  return onTournament(
    form,
    (supabase, id) => supabase.rpc('reopen_tournament_registration', { p_tournament_id: id }),
    'Inscripción abierta de nuevo.',
  )
}

export async function startTournament(_previous: ActionState, form: FormData): Promise<ActionState> {
  return onTournament(form, (supabase, id) => supabase.rpc('start_tournament', { p_tournament_id: id }), 'Fixture armado. ¡A jugar!')
}

export async function finishTournament(_previous: ActionState, form: FormData): Promise<ActionState> {
  return onTournament(
    form,
    (supabase, id) => supabase.rpc('finish_tournament', { p_tournament_id: id }),
    'Torneo finalizado. El ranking quedó fijo.',
  )
}

export async function cancelTournament(_previous: ActionState, form: FormData): Promise<ActionState> {
  return onTournament(
    form,
    (supabase, id) => supabase.rpc('cancel_tournament', { p_tournament_id: id }),
    'Torneo cancelado. Las canchas quedaron libres.',
  )
}

export async function addGuest(_previous: ActionState, form: FormData): Promise<ActionState> {
  const name = readText(form, 'guestName', { maxLength: 60 })
  if (!name) return INVALID_INPUT
  return onTournament(
    form,
    (supabase, id) => supabase.rpc('add_tournament_guest', { p_tournament_id: id, p_name: name }),
    'Invitado agregado.',
  )
}

export async function removeEntry(_previous: ActionState, form: FormData): Promise<ActionState> {
  const entryId = readUuid(form, 'entryId')
  if (!entryId) return INVALID_INPUT
  return run(
    (supabase) => supabase.rpc('remove_tournament_entry', { p_entry_id: entryId }),
    'Lo sacaste del torneo. Si había pagado, aparece en Cobros para devolver.',
  )
}

export async function recordScore(_previous: ActionState, form: FormData): Promise<ActionState> {
  const gameId = readUuid(form, 'gameId')
  const scoreA = readInt(form, 'scoreA', { min: 0, max: 99 })
  if (!gameId || scoreA === null) return INVALID_INPUT
  return run((supabase) => supabase.rpc('record_tournament_score', { p_game_id: gameId, p_score_a: scoreA }), 'Resultado guardado.')
}

export async function recordTournamentCash(_previous: ActionState, form: FormData): Promise<ActionState> {
  const entryId = readUuid(form, 'entryId')
  const amount = readInt(form, 'amount', { min: 1, max: 10_000_000 })
  if (!entryId || amount === null) return INVALID_INPUT
  return run((supabase) => supabase.rpc('record_tournament_cash', { p_entry_id: entryId, p_amount: amount }), 'Pago en efectivo registrado.')
}

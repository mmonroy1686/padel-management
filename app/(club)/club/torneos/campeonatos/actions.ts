'use server'

import { redirect } from 'next/navigation'
import { failed, fromRpc, INVALID_INPUT, ok, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { getViewer } from '@/lib/auth/viewer'
import {
  parseCategoryForm,
  parseChampionshipForm,
  parsePairForm,
  parseWindowForm,
  type PairPlayerInput,
} from '@/lib/domain/championship-form'
import { errorMessage } from '@/lib/domain/errors'
import { readInt, readUuid } from '@/lib/domain/input'
import { createClient } from '@/lib/supabase/server'

type Supabase = Awaited<ReturnType<typeof createClient>>
type RpcCall = PromiseLike<{ error: { message: string } | null }>

const SESSION_EXPIRED = failed('Tu sesión venció. Volvé a ingresar.')

// The database checks the caller is staff; these only check the shape of what comes in.
async function run(call: (supabase: Supabase) => RpcCall, okMessage: string): Promise<ActionState> {
  const supabase = await createClient()
  const { error } = await call(supabase)
  revalidateBookings()
  return fromRpc(error, okMessage)
}

async function onId(
  form: FormData,
  field: string,
  call: (supabase: Supabase, id: string) => RpcCall,
  okMessage: string,
): Promise<ActionState> {
  const id = readUuid(form, field)
  if (!id) return INVALID_INPUT
  return run((supabase) => call(supabase, id), okMessage)
}

export async function createChampionship(_previous: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer()
  if (!viewer) return SESSION_EXPIRED
  const parsed = parseChampionshipForm(form, viewer.club.timezone)
  if (!parsed.ok) return failed(parsed.message)
  const { name, rules, maxCategories, closesAt } = parsed.value
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_championship', {
    p_club_id: viewer.club.id,
    p_name: name,
    p_rules: rules,
    p_max_categories: maxCategories,
    ...(closesAt ? { p_registration_closes_at: closesAt } : {}),
  })
  if (error) return fromRpc(error, '')
  revalidateBookings()
  redirect(`/club/torneos/campeonatos/${data.id}`)
}

export async function updateChampionship(_previous: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer()
  if (!viewer) return SESSION_EXPIRED
  const championshipId = readUuid(form, 'championshipId')
  if (!championshipId) return INVALID_INPUT
  const parsed = parseChampionshipForm(form, viewer.club.timezone)
  if (!parsed.ok) return failed(parsed.message)
  const { name, rules, maxCategories, closesAt } = parsed.value
  return run(
    (supabase) =>
      supabase.rpc('update_championship', {
        p_championship_id: championshipId,
        p_name: name,
        p_rules: rules,
        p_max_categories: maxCategories,
        ...(closesAt ? { p_registration_closes_at: closesAt } : {}),
      }),
    'Datos guardados.',
  )
}

export async function addWindow(_previous: ActionState, form: FormData): Promise<ActionState> {
  const parsed = parseWindowForm(form)
  if (!parsed.ok) return failed(parsed.message)
  const { championshipId, date, fromTime, toTime, courtIds } = parsed.value
  return run(
    (supabase) =>
      supabase.rpc('add_championship_window', {
        p_championship_id: championshipId,
        p_date: date,
        p_from: fromTime,
        p_to: toTime,
        p_court_ids: courtIds,
      }),
    'Día de juego agregado.',
  )
}

export async function deleteWindow(_previous: ActionState, form: FormData): Promise<ActionState> {
  return onId(form, 'windowId', (supabase, id) => supabase.rpc('delete_championship_window', { p_window_id: id }), 'Día de juego quitado.')
}

export async function addCategory(_previous: ActionState, form: FormData): Promise<ActionState> {
  const parsed = parseCategoryForm(form)
  if (!parsed.ok) return failed(parsed.message)
  const input = parsed.value
  return run(
    (supabase) =>
      supabase.rpc('add_championship_category', {
        p_championship_id: input.championshipId,
        p_name: input.name,
        p_gender: input.gender,
        p_min_pairs: input.minPairs,
        p_max_pairs: input.maxPairs,
        p_price: input.price,
        p_format: input.format,
        p_group_size: input.groupSize,
        p_qualifiers: input.qualifiers,
        p_match_minutes: input.matchMinutes,
        p_seeding: input.seeding,
        p_third_set: input.thirdSet,
        p_golden_point: input.goldenPoint,
        ...(input.levelMin !== null && input.levelMax !== null ? { p_level_min: input.levelMin, p_level_max: input.levelMax } : {}),
      }),
    'Categoría agregada.',
  )
}

export async function deleteCategory(_previous: ActionState, form: FormData): Promise<ActionState> {
  return onId(form, 'categoryId', (supabase, id) => supabase.rpc('delete_championship_category', { p_category_id: id }), 'Categoría quitada.')
}

export async function openRegistration(_previous: ActionState, form: FormData): Promise<ActionState> {
  return onId(
    form,
    'championshipId',
    (supabase, id) => supabase.rpc('open_championship_registration', { p_championship_id: id }),
    'Inscripción abierta. Las canchas de los días de juego quedaron bloqueadas.',
  )
}

export async function closeRegistration(_previous: ActionState, form: FormData): Promise<ActionState> {
  return onId(
    form,
    'championshipId',
    (supabase, id) => supabase.rpc('close_championship_registration', { p_championship_id: id }),
    'Inscripción cerrada. Desde ahora solo el club carga o quita parejas.',
  )
}

export async function cancelChampionship(_previous: ActionState, form: FormData): Promise<ActionState> {
  return onId(
    form,
    'championshipId',
    (supabase, id) => supabase.rpc('cancel_championship', { p_championship_id: id }),
    'Campeonato cancelado. Las canchas quedaron libres y lo cobrado está en Cobros para devolver.',
  )
}

function player1Args(player: PairPlayerInput) {
  return player.kind === 'member'
    ? { p_player1_profile_id: player.profileId }
    : { p_player1_name: player.name, p_player1_phone: player.phone }
}

function player2Args(player: PairPlayerInput) {
  return player.kind === 'member'
    ? { p_player2_profile_id: player.profileId }
    : { p_player2_name: player.name, p_player2_phone: player.phone }
}

// "Cargar pareja": members, people from outside or one of each.
export async function addPair(_previous: ActionState, form: FormData): Promise<ActionState> {
  const parsed = parsePairForm(form)
  if (!parsed.ok) return failed(parsed.message)
  const { categoryId, player1, player2, note } = parsed.value
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('add_championship_pair', {
    p_category_id: categoryId,
    p_player1_level: player1.level,
    p_player2_level: player2.level,
    ...player1Args(player1),
    ...player2Args(player2),
    ...(note ? { p_note: note } : {}),
  })
  revalidateBookings()
  if (error) return failed(errorMessage(error.message))
  return ok(data.status === 'waiting' ? 'Pareja cargada en la lista de espera.' : 'Pareja cargada.')
}

export async function removePair(_previous: ActionState, form: FormData): Promise<ActionState> {
  return onId(
    form,
    'entryId',
    (supabase, id) => supabase.rpc('remove_championship_entry', { p_entry_id: id }),
    'Pareja quitada. Si había pagado, aparece en Cobros para devolver.',
  )
}

export async function movePair(_previous: ActionState, form: FormData): Promise<ActionState> {
  const entryId = readUuid(form, 'entryId')
  const categoryId = readUuid(form, 'categoryId')
  if (!entryId || !categoryId) return INVALID_INPUT
  return run(
    (supabase) => supabase.rpc('move_championship_entry', { p_entry_id: entryId, p_category_id: categoryId }),
    'Pareja movida. Si no había lugar, quedó en la lista de espera.',
  )
}

export async function recordChampionshipCash(_previous: ActionState, form: FormData): Promise<ActionState> {
  const entryId = readUuid(form, 'entryId')
  const amount = readInt(form, 'amount', { min: 1, max: 10_000_000 })
  if (!entryId || amount === null) return INVALID_INPUT
  return run(
    (supabase) => supabase.rpc('record_championship_cash', { p_entry_id: entryId, p_amount: amount }),
    'Pago en efectivo registrado.',
  )
}

export async function mergeCategory(_previous: ActionState, form: FormData): Promise<ActionState> {
  const categoryId = readUuid(form, 'categoryId')
  const intoId = readUuid(form, 'intoId')
  if (!categoryId || !intoId) return INVALID_INPUT
  return run(
    (supabase) => supabase.rpc('merge_championship_category', { p_category_id: categoryId, p_into_id: intoId }),
    'Categorías fusionadas. Las parejas que no entraron quedaron en espera.',
  )
}

export async function cancelCategory(_previous: ActionState, form: FormData): Promise<ActionState> {
  return onId(
    form,
    'categoryId',
    (supabase, id) => supabase.rpc('cancel_championship_category', { p_category_id: id }),
    'Categoría cancelada. Lo cobrado está en Cobros para devolver.',
  )
}

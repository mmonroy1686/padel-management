'use server'

import { failed, fromRpc, INVALID_INPUT, ok, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { getViewer } from '@/lib/auth/viewer'
import { loadFixture } from '@/lib/data/championship-fixture'
import { loadChampionship } from '@/lib/data/championships'
import { drawCategories, drawChampionship, drawPayload } from '@/lib/domain/championship-draw'
import { readGroupOrderForm, readResultForm, readSeedsForm, readSlotForm } from '@/lib/domain/championship-fixture-form'
import { checkResult } from '@/lib/domain/championship-results'
import { scheduleChampionship, scheduleInput, schedulePayload } from '@/lib/domain/championship-schedule'
import { closingOrder, decisivePlaces } from '@/lib/domain/championship-standings'
import type { ChampionshipCategory } from '@/lib/domain/championships'
import { errorMessage } from '@/lib/domain/errors'
import { readBoolean, readUuid } from '@/lib/domain/input'
import { createClient } from '@/lib/supabase/server'

type Supabase = Awaited<ReturnType<typeof createClient>>
type RpcCall = PromiseLike<{ error: { message: string } | null }>
type Closing = 'closed' | 'tied' | 'open'

const SESSION_EXPIRED = failed('Tu sesión venció. Volvé a ingresar.')
const NOT_FOUND = failed(errorMessage('not_found'))

// The database checks the caller is staff and every hard rule; these check the shape of what comes in and run
// the pure draw, schedule, result and table code.
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

// "Guardar cabezas de serie".
export async function saveSeeds(_previous: ActionState, form: FormData): Promise<ActionState> {
  const parsed = readSeedsForm(form)
  if (!parsed.ok) return failed(parsed.message)
  const { categoryId, entryIds } = parsed.value
  return run(
    (supabase) => supabase.rpc('set_championship_seeds', { p_category_id: categoryId, p_entry_ids: entryIds }),
    'Cabezas de serie guardadas. Se usan en el próximo sorteo.',
  )
}

// "Sortear" / "Volver a sortear": a new seed every time.
export async function drawFixture(_previous: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer()
  if (!viewer) return SESSION_EXPIRED
  const championshipId = readUuid(form, 'championshipId')
  if (!championshipId) return INVALID_INPUT
  const championship = await loadChampionship(viewer.club, championshipId)
  if (!championship) return NOT_FOUND
  const seed = Math.floor(Math.random() * 2_147_483_647)
  const draw = drawChampionship(drawCategories(championship), seed)
  if (!draw.ok) return failed(draw.message)
  return run(
    (supabase) =>
      supabase.rpc('save_championship_draw', {
        p_championship_id: championshipId,
        p_seed: seed,
        p_draw: drawPayload(draw.draws),
      }),
    'Sorteo listo. Revisá las zonas y las llaves y programá los partidos.',
  )
}

function scheduledText(placed: number, unplaced: number): string {
  if (unplaced > 0) {
    return `Ubicamos ${placed} ${placed === 1 ? 'partido' : 'partidos'}; ${unplaced} ${unplaced === 1 ? 'quedó' : 'quedaron'} sin lugar (abajo, con el motivo).`
  }
  return placed === 1 ? 'Listo: el partido tiene cancha y horario.' : `Listo: los ${placed} partidos tienen cancha y horario.`
}

// "Programar" / "Volver a programar": the pinned matches stay where they are.
export async function scheduleFixture(_previous: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer()
  if (!viewer) return SESSION_EXPIRED
  const championshipId = readUuid(form, 'championshipId')
  if (!championshipId) return INVALID_INPUT
  const [championship, fixture] = await Promise.all([
    loadChampionship(viewer.club, championshipId),
    loadFixture(championshipId),
  ])
  if (!championship) return NOT_FOUND
  if (fixture.matches.length === 0) return failed('Primero sorteá las zonas y las llaves.')
  const result = scheduleChampionship(scheduleInput(championship, fixture, viewer.club.timezone))
  return run(
    (supabase) =>
      supabase.rpc('save_championship_schedule', {
        p_championship_id: championshipId,
        p_slots: schedulePayload(result),
      }),
    scheduledText(fixture.matches.length - result.unplaced.length, result.unplaced.length),
  )
}

// "Mover": a court and a start from the options of the sheet (it also pins the match).
export async function moveMatch(_previous: ActionState, form: FormData): Promise<ActionState> {
  const parsed = readSlotForm(form)
  if (!parsed.ok) return failed(parsed.message)
  const { matchId, courtId, startsAt } = parsed.value
  return run(
    (supabase) => supabase.rpc('set_match_slot', { p_match_id: matchId, p_court_id: courtId, p_starts_at: startsAt }),
    'Partido movido.',
  )
}

// "Fijar" / "Soltar".
export async function pinMatch(_previous: ActionState, form: FormData): Promise<ActionState> {
  const matchId = readUuid(form, 'matchId')
  const pinned = form.get('pinned')
  if (!matchId || (pinned !== 'true' && pinned !== 'false')) return INVALID_INPUT
  return run(
    (supabase) => supabase.rpc('set_match_pinned', { p_match_id: matchId, p_pinned: pinned === 'true' }),
    pinned === 'true' ? 'Partido fijado: "Volver a programar" no lo mueve.' : 'Partido suelto.',
  )
}

// "Publicar fixture", optionally giving back to the grid what the matches do not use.
export async function publishFixture(_previous: ActionState, form: FormData): Promise<ActionState> {
  const championshipId = readUuid(form, 'championshipId')
  if (!championshipId) return INVALID_INPUT
  return run(
    (supabase) =>
      supabase.rpc('publish_championship', {
        p_championship_id: championshipId,
        p_release_free: readBoolean(form, 'releaseFree'),
      }),
    'Fixture publicado. Les avisamos a las parejas y ya se puede compartir.',
  )
}

export async function startMatch(_previous: ActionState, form: FormData): Promise<ActionState> {
  return onId(form, 'matchId', (supabase, id) => supabase.rpc('start_match', { p_match_id: id }), 'Partido en juego.')
}

// After a group result: when the group is complete and nothing level decides a place, it closes by itself and
// its places go to the bracket; a tie that decides one is the organizer's ("Cerrar zona").
async function closeIfComplete(
  supabase: Supabase,
  championshipId: string,
  groupId: string | null,
  category: Pick<ChampionshipCategory, 'format' | 'qualifiers'>,
): Promise<Closing> {
  if (!groupId) return 'open'
  const fixture = await loadFixture(championshipId)
  const group = fixture.groups.find((item) => item.id === groupId)
  if (!group) return 'open'
  const order = closingOrder(group, fixture.matches, decisivePlaces(category, group.members.length))
  if (!order.ok) return order.reason === 'tied' ? 'tied' : 'open'
  const { error } = await supabase.rpc('close_championship_group', { p_group_id: groupId, p_entry_ids: order.order })
  return error ? 'open' : 'closed'
}

function savedText(saved: string, closing: Closing): string {
  if (closing === 'closed') return `${saved} La zona terminó: los clasificados pasaron a la llave.`
  if (closing === 'tied') return `${saved} La zona terminó con un empate: ordenala con "Cerrar zona".`
  return saved
}

async function matchOf(championshipId: string, matchId: string) {
  const viewer = await getViewer()
  if (!viewer) return null
  const [championship, fixture] = await Promise.all([
    loadChampionship(viewer.club, championshipId),
    loadFixture(championshipId),
  ])
  const match = fixture.matches.find((item) => item.id === matchId)
  const category = championship?.categories.find((item) => item.id === match?.categoryId)
  return match && category ? { match, category } : null
}

// "Cargar resultado" (also to correct one).
export async function recordResult(_previous: ActionState, form: FormData): Promise<ActionState> {
  const championshipId = readUuid(form, 'championshipId')
  const parsed = readResultForm(form)
  if (!parsed.ok) return failed(parsed.message)
  if (!championshipId) return INVALID_INPUT
  const { matchId, sets } = parsed.value
  const found = await matchOf(championshipId, matchId)
  if (!found) return NOT_FOUND
  const check = checkResult(sets, found.category)
  if (!check.ok) return failed(check.message)
  const supabase = await createClient()
  const { error } = await supabase.rpc('record_match_result', { p_match_id: matchId, p_sets: sets })
  if (error) {
    revalidateBookings()
    return fromRpc(error, '')
  }
  const closing = await closeIfComplete(supabase, championshipId, found.match.groupId, found.category)
  revalidateBookings()
  return ok(savedText('Resultado guardado.', closing))
}

// "W.O.": the pair that did not show up.
export async function recordWalkover(_previous: ActionState, form: FormData): Promise<ActionState> {
  const championshipId = readUuid(form, 'championshipId')
  const matchId = readUuid(form, 'matchId')
  const absentId = readUuid(form, 'absentId')
  if (!championshipId || !matchId || !absentId) return INVALID_INPUT
  const found = await matchOf(championshipId, matchId)
  if (!found) return NOT_FOUND
  const supabase = await createClient()
  const { error } = await supabase.rpc('record_walkover', { p_match_id: matchId, p_absent_entry_id: absentId })
  if (error) {
    revalidateBookings()
    return fromRpc(error, '')
  }
  const closing = await closeIfComplete(supabase, championshipId, found.match.groupId, found.category)
  revalidateBookings()
  return ok(savedText('W.O. guardado.', closing))
}

// "Cerrar zona": the organizer's order (after a tie, the draw is theirs).
export async function closeGroup(_previous: ActionState, form: FormData): Promise<ActionState> {
  const parsed = readGroupOrderForm(form)
  if (!parsed.ok) return failed(parsed.message)
  const { groupId, entryIds } = parsed.value
  return run(
    (supabase) => supabase.rpc('close_championship_group', { p_group_id: groupId, p_entry_ids: entryIds }),
    'Zona cerrada: los clasificados pasaron a la llave.',
  )
}

export async function finishFixture(_previous: ActionState, form: FormData): Promise<ActionState> {
  return onId(
    form,
    'championshipId',
    (supabase, id) => supabase.rpc('finish_championship', { p_championship_id: id }),
    'Campeonato finalizado.',
  )
}

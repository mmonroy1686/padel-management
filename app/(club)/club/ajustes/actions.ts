'use server'

import { failed, INVALID_INPUT, ok, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { getViewer } from '@/lib/auth/viewer'
import { isClubLogoPath } from '@/lib/domain/club-logo'
import { errorMessage } from '@/lib/domain/errors'
import { readBoolean, readInt, readText, readUuid } from '@/lib/domain/input'
import { parseLoyaltyForm } from '@/lib/domain/loyalty'
import { parseClubSettings, parsePricingRule } from '@/lib/domain/settings'
import { createClient } from '@/lib/supabase/server'

const FORBIDDEN = failed(errorMessage('forbidden'))

// RLS already limits these writes to admins; this gives a clear message instead of a silent no-op.
async function adminClubId(): Promise<string | null> {
  const viewer = await getViewer()
  return viewer?.membership?.role === 'admin' ? viewer.club.id : null
}

export async function updateClubSettings(_previous: ActionState, form: FormData): Promise<ActionState> {
  const clubId = await adminClubId()
  if (!clubId) return FORBIDDEN
  const parsed = parseClubSettings(form)
  if (!parsed.ok) return failed(parsed.message)

  const supabase = await createClient()
  const { data, error } = await supabase.from('clubs').update(parsed.value).eq('id', clubId).select('id')
  if (error) return failed('No pudimos guardar los ajustes. Revisá los datos.')
  if (data.length === 0) return FORBIDDEN
  revalidateBookings()
  return ok('Ajustes guardados. Las reservas ya hechas no cambian.')
}

// Stamps rule (Ajustes → Sellos). The clubs check constraints have the last word.
export async function updateLoyalty(_previous: ActionState, form: FormData): Promise<ActionState> {
  const clubId = await adminClubId()
  if (!clubId) return FORBIDDEN
  const parsed = parseLoyaltyForm(form)
  if (!parsed.ok) return failed(parsed.message)

  const supabase = await createClient()
  const { data, error } = await supabase.from('clubs').update(parsed.value).eq('id', clubId).select('id')
  if (error) return failed('No pudimos guardar los sellos. Revisá los datos.')
  if (data.length === 0) return FORBIDDEN
  revalidateBookings()
  return ok('Sellos guardados.')
}

export async function addCourt(_previous: ActionState, form: FormData): Promise<ActionState> {
  const clubId = await adminClubId()
  if (!clubId) return FORBIDDEN
  const name = readText(form, 'name', { maxLength: 40 })
  if (!name) return INVALID_INPUT

  const supabase = await createClient()
  const { error } = await supabase.from('courts').insert({
    club_id: clubId,
    name,
    is_covered: readBoolean(form, 'is_covered'),
    sort_order: readInt(form, 'sortOrder', { min: 0, max: 100 }) ?? 0,
  })
  if (error?.code === '23505') return failed('Ya hay una cancha con ese nombre.')
  if (error) return failed('No pudimos agregar la cancha.')
  revalidateBookings()
  return ok('Cancha agregada.')
}

export async function updateCourt(_previous: ActionState, form: FormData): Promise<ActionState> {
  const clubId = await adminClubId()
  if (!clubId) return FORBIDDEN
  const courtId = readUuid(form, 'courtId')
  const name = readText(form, 'name', { maxLength: 40 })
  if (!courtId || !name) return INVALID_INPUT

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('courts')
    .update({ name, is_covered: readBoolean(form, 'is_covered'), is_active: readBoolean(form, 'is_active') })
    .eq('id', courtId)
    .eq('club_id', clubId)
    .select('id')
  if (error?.code === '23505') return failed('Ya hay una cancha con ese nombre.')
  if (error) return failed('No pudimos guardar la cancha.')
  if (data.length === 0) return FORBIDDEN
  revalidateBookings()
  return ok('Cancha guardada.')
}

// The database refuses a court with bookings, recurring slots or matches (court_has_history).
export async function deleteCourt(_previous: ActionState, form: FormData): Promise<ActionState> {
  const clubId = await adminClubId()
  if (!clubId) return FORBIDDEN
  const courtId = readUuid(form, 'courtId')
  if (!courtId) return INVALID_INPUT

  const supabase = await createClient()
  const { data, error } = await supabase.from('courts').delete().eq('id', courtId).eq('club_id', clubId).select('id')
  if (error?.message === 'court_has_history') return failed(errorMessage('court_has_history'))
  if (error) return failed('No pudimos borrar la cancha.')
  if (data.length === 0) return FORBIDDEN
  revalidateBookings()
  return ok('Cancha borrada.')
}

export async function addPricingRule(_previous: ActionState, form: FormData): Promise<ActionState> {
  const clubId = await adminClubId()
  if (!clubId) return FORBIDDEN
  const parsed = parsePricingRule(form)
  if (!parsed.ok) return failed(parsed.message)

  const supabase = await createClient()
  const { error } = await supabase.from('pricing_rules').insert({ club_id: clubId, ...parsed.value })
  if (error?.message === 'pricing_rule_overlap') {
    return failed('Ya hay una franja que empieza a esa hora en alguno de esos días. Borrala o elegí otra hora.')
  }
  if (error) return failed('No pudimos guardar el precio.')
  revalidateBookings()
  return ok('Precio agregado.')
}

export async function deletePricingRule(_previous: ActionState, form: FormData): Promise<ActionState> {
  const clubId = await adminClubId()
  if (!clubId) return FORBIDDEN
  const ruleId = readUuid(form, 'ruleId')
  if (!ruleId) return INVALID_INPUT

  const supabase = await createClient()
  const { data, error } = await supabase.from('pricing_rules').delete().eq('id', ruleId).eq('club_id', clubId).select('id')
  if (error) return failed('No pudimos borrar el precio.')
  if (data.length === 0) return FORBIDDEN
  revalidateBookings()
  return ok('Precio borrado. Los turnos sin precio dejan de ofrecerse.')
}

// Ajustes → Logo. The browser already uploaded the file (only admins can); this points the club at it.
export async function saveClubLogo(path: string): Promise<ActionState> {
  const clubId = await adminClubId()
  if (!clubId) return FORBIDDEN
  if (typeof path !== 'string' || !isClubLogoPath(clubId, path)) return INVALID_INPUT
  return setClubLogo(clubId, path, 'Logo guardado. Ya se ve en toda la app.')
}

export async function removeClubLogo(): Promise<ActionState> {
  const clubId = await adminClubId()
  if (!clubId) return FORBIDDEN
  return setClubLogo(clubId, null, 'Logo quitado.')
}

async function setClubLogo(clubId: string, path: string | null, message: string): Promise<ActionState> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('clubs').update({ logo_path: path }).eq('id', clubId).select('id')
  if (error) return failed('No pudimos guardar el logo.')
  if (data.length === 0) return FORBIDDEN
  revalidateBookings()
  return ok(message)
}

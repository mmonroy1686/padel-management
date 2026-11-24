'use server'

import { failed, fromRpc, INVALID_INPUT, ok, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { getViewer } from '@/lib/auth/viewer'
import { isClubPhotoPath, LOGO_BUCKET } from '@/lib/domain/club-logo'
import { parseClubInfoForm } from '@/lib/domain/club-info'
import { errorMessage } from '@/lib/domain/errors'
import { isUuid } from '@/lib/domain/input'
import { createClient } from '@/lib/supabase/server'

const FORBIDDEN = failed(errorMessage('forbidden'))

// The admin's club, or null for anyone else.
async function adminClubId(): Promise<string | null> {
  const viewer = await getViewer()
  return viewer?.membership?.role === 'admin' ? viewer.club.id : null
}

// Ajustes → "Datos del club": contact, location and services in one save.
export async function saveClubInfo(_previous: ActionState, form: FormData): Promise<ActionState> {
  const clubId = await adminClubId()
  if (!clubId) return FORBIDDEN
  const parsed = parseClubInfoForm(form)
  if (!parsed.ok) return failed(parsed.message)
  const info = parsed.value
  const supabase = await createClient()
  const { error } = await supabase.rpc('save_club_info', {
    p_club_id: clubId,
    p_address: info.address ?? '',
    p_latitude: info.latitude as number,
    p_longitude: info.longitude as number,
    p_google_maps_url: info.googleMapsUrl ?? '',
    p_phone: info.phone ?? '',
    p_instagram: info.instagram ?? '',
    p_contact_email: info.contactEmail ?? '',
    p_amenities: info.amenities,
  })
  if (!error) revalidateBookings()
  return fromRpc(error, 'Datos guardados. Ya se ven en el Inicio de los jugadores.')
}

// The browser already shrank and uploaded the photo to the club's folder; this puts it last.
export async function addClubPhoto(path: string): Promise<ActionState> {
  const clubId = await adminClubId()
  if (!clubId) return FORBIDDEN
  if (typeof path !== 'string' || !isClubPhotoPath(clubId, path)) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('add_club_photo', { p_club_id: clubId, p_path: path })
  if (error) {
    // The file is there but the club does not point at it: take it out. A repeated path (23505) is a retry of a
    // photo already added, whose file stays.
    if (error.code !== '23505') await supabase.storage.from(LOGO_BUCKET).remove([path])
    return failed(errorMessage(error.message))
  }
  revalidateBookings()
  return ok('Foto agregada.')
}

export async function removeClubPhoto(photoId: string): Promise<ActionState> {
  if (!(await adminClubId())) return FORBIDDEN
  if (!isUuid(photoId)) return INVALID_INPUT
  const supabase = await createClient()
  const { data: path, error } = await supabase.rpc('remove_club_photo', { p_photo_id: photoId })
  if (error) return failed(errorMessage(error.message))
  // The photo is already out of Inicio; a file left behind is only space.
  await supabase.storage.from(LOGO_BUCKET).remove([path])
  revalidateBookings()
  return ok('Foto quitada.')
}

export async function moveClubPhoto(photoId: string, step: number): Promise<ActionState> {
  if (!(await adminClubId())) return FORBIDDEN
  if (!isUuid(photoId) || (step !== -1 && step !== 1)) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('move_club_photo', { p_photo_id: photoId, p_step: step })
  if (!error) revalidateBookings()
  return fromRpc(error, 'Orden guardado.')
}

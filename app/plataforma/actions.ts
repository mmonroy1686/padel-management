'use server'

import { revalidatePath } from 'next/cache'
import { failed, fromRpc, INVALID_INPUT, ok, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { requestOrigin } from '@/lib/auth/request-origin'
import { clubDomainSuffix, clubUrl } from '@/lib/club/host'
import { errorMessage } from '@/lib/domain/errors'
import { readUuid } from '@/lib/domain/input'
import { parseNewClubForm, parseRenameClubForm } from '@/lib/domain/platform'
import { parseAccountContactForm, parseAccountStatusForm } from '@/lib/domain/platform-trial'
import { createClient } from '@/lib/supabase/server'

// /plataforma. create_club and resend_admin_invitation check the platform admin. revalidateBookings refreshes the app
// and, once the response is out, empties the mail queue (lib/notify/outbox): that sends the admin's invitation.

export async function createClub(_previous: ActionState, form: FormData): Promise<ActionState> {
  const parsed = parseNewClubForm(form)
  if (!parsed.ok) return failed(parsed.message)
  const { name, slug, timezone, adminEmail } = parsed.value
  const origin = await requestOrigin()
  // Without subdomains every host is the default club: the new one would have no address, nor its invitation.
  if (!clubDomainSuffix(process.env, origin)) {
    return failed('Para crear clubes hace falta el dominio (NEXT_PUBLIC_ROOT_DOMAIN): cada club vive en su subdominio.')
  }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_club', {
    p_slug: slug,
    p_name: name,
    p_timezone: timezone,
    p_admin_email: adminEmail,
  })
  if (error || !data) return failed(errorMessage(error?.message))
  revalidateBookings()
  const url = clubUrl(data.slug, process.env, origin)
  return ok(`Listo: ${data.name} está en ${url}. Le mandamos la invitación a ${adminEmail}; también puede entrar en ${url}/invitacion con ese email.`)
}

// The club moves to another subdomain (rename_club checks the platform admin and the slug).
export async function renameClub(_previous: ActionState, form: FormData): Promise<ActionState> {
  const parsed = parseRenameClubForm(form)
  if (!parsed.ok) return failed(parsed.message)
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('rename_club', { p_club_id: parsed.value.clubId, p_slug: parsed.value.slug })
  if (error || !data) return failed(errorMessage(error?.message))
  revalidateBookings()
  return ok(`Listo: ${data.name} ahora está en ${clubUrl(data.slug, process.env, await requestOrigin())}.`)
}

export async function resendAdminInvitation(_previous: ActionState, form: FormData): Promise<ActionState> {
  const clubId = readUuid(form, 'clubId')
  if (!clubId) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('resend_admin_invitation', { p_club_id: clubId })
  const result = fromRpc(error, 'Reenviada: vence en 7 días.')
  if (result.status === 'ok') revalidateBookings()
  return result
}

// The club's page: status and end of the trial. Nothing else changes: the club keeps working.
export async function setAccountStatus(_previous: ActionState, form: FormData): Promise<ActionState> {
  const parsed = parseAccountStatusForm(form)
  if (!parsed.ok) return failed(parsed.message)
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_club_account_status', {
    p_club_id: parsed.value.clubId,
    p_status: parsed.value.status,
    p_trial_ends_on: parsed.value.trialEndsOn ?? undefined,
  })
  const result = fromRpc(error, 'Guardado.')
  if (result.status === 'ok') revalidatePath('/plataforma', 'layout')
  return result
}

export async function saveAccountContact(_previous: ActionState, form: FormData): Promise<ActionState> {
  const parsed = parseAccountContactForm(form)
  if (!parsed.ok) return failed(parsed.message)
  const { clubId, ownerName, ownerPhone, ownerEmail, notes } = parsed.value
  const supabase = await createClient()
  const { error } = await supabase.rpc('save_club_account_contact', {
    p_club_id: clubId,
    p_owner_name: ownerName,
    p_owner_phone: ownerPhone,
    p_owner_email: ownerEmail,
    p_notes: notes,
  })
  const result = fromRpc(error, 'Guardado.')
  if (result.status === 'ok') revalidatePath('/plataforma', 'layout')
  return result
}

// "Entrar como soporte": admin of the club, marked and logged; "Salir del club" puts the previous role back.
export async function joinAsSupport(_previous: ActionState, form: FormData): Promise<ActionState> {
  const clubId = readUuid(form, 'clubId')
  if (!clubId) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('join_club_as_support', { p_club_id: clubId })
  const result = fromRpc(error, 'Listo: sos admin del club como soporte.')
  if (result.status === 'ok') revalidatePath('/plataforma', 'layout')
  return result
}

export async function leaveSupport(_previous: ActionState, form: FormData): Promise<ActionState> {
  const clubId = readUuid(form, 'clubId')
  if (!clubId) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('leave_club_support', { p_club_id: clubId })
  const result = fromRpc(error, 'Saliste del club.')
  if (result.status === 'ok') revalidatePath('/plataforma', 'layout')
  return result
}

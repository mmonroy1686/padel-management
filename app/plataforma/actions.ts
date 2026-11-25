'use server'

import { failed, fromRpc, INVALID_INPUT, ok, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { requestOrigin } from '@/lib/auth/request-origin'
import { clubDomainSuffix, clubUrl } from '@/lib/club/host'
import { errorMessage } from '@/lib/domain/errors'
import { readUuid } from '@/lib/domain/input'
import { parseNewClubForm, parseRenameClubForm } from '@/lib/domain/platform'
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

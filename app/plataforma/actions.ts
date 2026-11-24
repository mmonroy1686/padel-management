'use server'

import { failed, fromRpc, INVALID_INPUT, ok, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { requestOrigin } from '@/lib/auth/request-origin'
import { clubUrl } from '@/lib/club/host'
import { errorMessage } from '@/lib/domain/errors'
import { readUuid } from '@/lib/domain/input'
import { parseNewClubForm } from '@/lib/domain/platform'
import { createClient } from '@/lib/supabase/server'

// /plataforma. create_club and resend_admin_invitation check the platform admin; revalidateBookings also mails the
// admin's invitation once the response is out.

export async function createClub(_previous: ActionState, form: FormData): Promise<ActionState> {
  const parsed = parseNewClubForm(form)
  if (!parsed.ok) return failed(parsed.message)
  const { name, slug, timezone, adminEmail } = parsed.value
  const supabase = await createClient()
  const { error } = await supabase.rpc('create_club', {
    p_slug: slug,
    p_name: name,
    p_timezone: timezone,
    p_admin_email: adminEmail,
  })
  if (error) return failed(errorMessage(error.message))
  revalidateBookings()
  const url = clubUrl(slug, process.env, await requestOrigin())
  return ok(`Listo: ${name} está en ${url}. Le mandamos la invitación a ${adminEmail}; también puede entrar en ${url}/invitacion con ese email.`)
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

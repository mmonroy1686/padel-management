'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { failed, type ActionState } from '@/lib/actions/result'
import { getViewer } from '@/lib/auth/viewer'
import { errorMessage } from '@/lib/domain/errors'
import { createClient } from '@/lib/supabase/server'

// "Aceptar invitación" on /invitacion: the session's email takes its invitation to this club, then the panel.
export async function acceptInvitation(): Promise<ActionState> {
  const viewer = await getViewer()
  if (!viewer) return failed('Tu sesión venció. Volvé a entrar con el link del mail.')
  const supabase = await createClient()
  const { error } = await supabase.rpc('accept_staff_invitation', { p_club_id: viewer.club.id })
  if (error) return failed(errorMessage(error.message))
  revalidatePath('/', 'layout')
  redirect('/club/inicio')
}

// "Entrar con otro email": the invitation is for the address it was sent to.
export async function signInWithAnotherEmail(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect(`/auth/ingreso?next=${encodeURIComponent('/invitacion')}`)
}

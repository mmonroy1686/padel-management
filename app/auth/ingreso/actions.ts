'use server'

import { redirect } from 'next/navigation'
import { getSiteUrl, safeNextPath } from '@/lib/auth/redirect'
import { createClient } from '@/lib/supabase/server'

export type MagicLinkState = { status: 'idle' | 'sent' | 'error'; message?: string }

function callbackUrl(next: string): string {
  return `${getSiteUrl()}/auth/callback?next=${encodeURIComponent(next)}`
}

export async function sendMagicLink(_previous: MagicLinkState, formData: FormData): Promise<MagicLinkState> {
  const email = String(formData.get('email') ?? '').trim()
  if (!email) return { status: 'error', message: 'Ingresá tu email.' }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callbackUrl(safeNextPath(formData.get('next'))) },
  })

  if (error) {
    // The reason goes to the server log (Vercel / terminal), without the address.
    console.error('signInWithOtp failed', { status: error.status, code: error.code, message: error.message })
    return { status: 'error', message: magicLinkErrorMessage(error.code) }
  }
  return { status: 'sent' }
}

function magicLinkErrorMessage(code: string | undefined): string {
  if (code === 'over_email_send_rate_limit') {
    return 'Se mandaron demasiados enlaces en poco tiempo. Probá de nuevo en un rato.'
  }
  if (code === 'email_address_not_authorized') {
    return 'Todavía no podemos mandar emails a esa dirección. Avisá al club.'
  }
  return 'No pudimos enviar el enlace. Probá de nuevo en un minuto.'
}

export async function signInWithGoogle(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: callbackUrl(safeNextPath(formData.get('next'))) },
  })

  if (error || !data.url) redirect('/auth/ingreso?error=google')
  redirect(data.url)
}

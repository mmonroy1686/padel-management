'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getSiteUrl, originFromHeaders, safeNextPath } from '@/lib/auth/redirect'
import { createClient } from '@/lib/supabase/server'

export type MagicLinkState = { status: 'idle' | 'sent' | 'error'; message?: string }

// Back to the host the visitor started on: the PKCE cookie that finishes the sign-in lives there.
async function callbackUrl(next: string): Promise<string> {
  const requestHeaders = await headers()
  const origin = originFromHeaders((name) => requestHeaders.get(name), getSiteUrl())
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`
}

export async function sendMagicLink(_previous: MagicLinkState, formData: FormData): Promise<MagicLinkState> {
  const email = String(formData.get('email') ?? '').trim()
  if (!email) return { status: 'error', message: 'Ingresá tu email.' }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: await callbackUrl(safeNextPath(formData.get('next'))) },
  })

  if (error) {
    // The reason goes to the server log (Vercel / terminal). Only status and code: GoTrue's
    // message can include the email address.
    console.error('signInWithOtp failed', { status: error.status, code: error.code })
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
    options: { redirectTo: await callbackUrl(safeNextPath(formData.get('next'))) },
  })

  if (error || !data.url) redirect('/auth/ingreso?error=google')
  redirect(data.url)
}

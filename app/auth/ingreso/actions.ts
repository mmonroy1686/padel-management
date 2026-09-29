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

  if (error) return { status: 'error', message: 'No pudimos enviar el enlace. Probá de nuevo en un minuto.' }
  return { status: 'sent' }
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

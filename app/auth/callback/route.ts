import { NextResponse, type NextRequest } from 'next/server'
import { findClub } from '@/lib/auth/viewer'
import { callbackError, landingAfterSignIn, originFromHeaders, safeNextPath } from '@/lib/auth/redirect'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  // Back to the host the person signed in on (each club's subdomain has its own session). nextUrl.origin can be the
  // server's own hostname in development, not the club's.
  const origin = originFromHeaders((name) => request.headers.get(name), request.nextUrl.origin)
  const code = searchParams.get('code')
  const next = safeNextPath(searchParams.get('next'))

  let reason = callbackError(searchParams.get('error_code') ?? undefined)
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // A player who never chose a photo gets the one of their Google account (read from auth.users, server side).
      // Best effort: signing in never fails over a photo.
      await supabase.rpc('sync_google_avatar').then(
        () => undefined,
        () => undefined,
      )
      return NextResponse.redirect(new URL(landingAfterSignIn(next, await roleInClub(supabase)), origin))
    }
    reason = callbackError(error.code)
  }

  // Back to Ingresar with the reason, keeping where the person was going.
  const signIn = new URL('/auth/ingreso', origin)
  signIn.searchParams.set('error', reason)
  signIn.searchParams.set('next', next)
  return NextResponse.redirect(signIn)
}

// The signed-in person's role in this host's club (null: not a member yet, or no club on this host).
async function roleInClub(supabase: Awaited<ReturnType<typeof createClient>>): Promise<'player' | 'reception' | 'admin' | null> {
  const [{ data: auth }, club] = await Promise.all([supabase.auth.getUser(), findClub()])
  if (!auth.user || !club) return null
  const { data } = await supabase.from('club_members').select('role').eq('club_id', club.id).eq('user_id', auth.user.id).maybeSingle()
  return data?.role ?? null
}

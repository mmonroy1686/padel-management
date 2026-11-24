import { NextResponse, type NextRequest } from 'next/server'
import { callbackError, originFromHeaders, safeNextPath } from '@/lib/auth/redirect'
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
    if (!error) return NextResponse.redirect(new URL(next, origin))
    reason = callbackError(error.code)
  }

  // Back to Ingresar with the reason, keeping where the person was going.
  const signIn = new URL('/auth/ingreso', origin)
  signIn.searchParams.set('error', reason)
  signIn.searchParams.set('next', next)
  return NextResponse.redirect(signIn)
}

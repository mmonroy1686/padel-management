import { NextResponse, type NextRequest } from 'next/server'
import { originFromHeaders, safeNextPath } from '@/lib/auth/redirect'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  // Back to the host the person signed in on (each club's subdomain has its own session). nextUrl.origin can be the
  // server's own hostname in development, not the club's.
  const origin = originFromHeaders((name) => request.headers.get(name), request.nextUrl.origin)
  const code = searchParams.get('code')
  const next = safeNextPath(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL(next, origin))
  }

  return NextResponse.redirect(new URL('/auth/ingreso?error=callback', origin))
}

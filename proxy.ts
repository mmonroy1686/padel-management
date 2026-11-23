import { NextResponse, type NextRequest } from 'next/server'
import { strayAuthCodeRedirect } from '@/lib/auth/redirect'
import { CLUB_SLUG_HEADER } from '@/lib/club/header'
import { clubSlugFromHost } from '@/lib/club/host'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  // Supabase lands the auth code on the Site URL when a redirect is not allowed: finish it anyway.
  const callback = strayAuthCodeRedirect(request.nextUrl)
  if (callback) return NextResponse.redirect(callback)
  // The club comes from the host, always set here: a club header sent by the browser is overwritten.
  const slug = clubSlugFromHost(request.headers.get('x-forwarded-host') ?? request.headers.get('host'))
  return updateSession(request, { [CLUB_SLUG_HEADER]: slug })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}

import { NextResponse, type NextRequest } from 'next/server'
import { strayAuthCodeRedirect } from '@/lib/auth/redirect'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  // Supabase lands the auth code on the Site URL when a redirect is not allowed: finish it anyway.
  const callback = strayAuthCodeRedirect(request.nextUrl)
  if (callback) return NextResponse.redirect(callback)
  return updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}

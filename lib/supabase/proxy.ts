import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from './database.types'
import { getSupabaseEnv } from './env'

// Refreshes the session and passes the request on. `extraHeaders` go to the app with the request (never to the browser);
// they are set again after every cookie change, since the request's headers carry the refreshed cookies.
export async function updateSession(request: NextRequest, extraHeaders: Record<string, string> = {}) {
  const forward = () => {
    const headers = new Headers(request.headers)
    for (const [name, value] of Object.entries(extraHeaders)) headers.set(name, value)
    return NextResponse.next({ request: { headers } })
  }
  let response = forward()
  const { url, publishableKey } = getSupabaseEnv()

  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = forward()
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  // Keep this call right after creating the client: it is what refreshes an expired session.
  await supabase.auth.getUser()

  return response
}

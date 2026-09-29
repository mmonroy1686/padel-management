import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../lib/supabase/database.types'
import { localSupabase } from './env'

export const E2E_DOMAIN = 'e2e.test'
const CLUB_SLUG = 'rustic'
const NO_SESSION = { auth: { persistSession: false, autoRefreshToken: false } }

export type Client = SupabaseClient<Database>
export type TestUser = { id: string; email: string; password: string; name: string }

// Service role: bypasses RLS. Only for preparing and cleaning test data on the local stack.
export function adminClient(): Client {
  const { apiUrl, serviceRoleKey } = localSupabase()
  return createClient<Database>(apiUrl, serviceRoleKey, NO_SESSION)
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@${E2E_DOMAIN}`
}

export async function clubRow(admin: Client = adminClient()) {
  const { data, error } = await admin.from('clubs').select('*').eq('slug', CLUB_SLUG).single()
  if (error) throw error
  return data
}

// A confirmed member of Rustic with a complete profile. It also has a password, so tests can
// prepare data through the API as that person; the UI still signs in with the magic link.
export async function createMember(options: {
  name: string
  prefix: string
  role?: 'player' | 'reception' | 'admin'
}): Promise<TestUser> {
  const admin = adminClient()
  const club = await clubRow(admin)
  const email = uniqueEmail(options.prefix)
  const password = `Clave-${Date.now()}!`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: options.name },
  })
  if (error) throw error
  const id = data.user.id

  const profile = await admin.from('profiles').update({ side: 'drive', hand: 'right' }).eq('id', id)
  if (profile.error) throw profile.error
  const member = await admin.from('club_members').insert({
    club_id: club.id,
    user_id: id,
    role: options.role ?? 'player',
    category: 5,
    category_validated: true,
  })
  if (member.error) throw member.error

  return { id, email, password, name: options.name }
}

export async function signedInClient(user: TestUser): Promise<Client> {
  const { apiUrl, publishableKey } = localSupabase()
  const client = createClient<Database>(apiUrl, publishableKey, NO_SESSION)
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password })
  if (error) throw error
  return client
}

// A booking that starts in a couple of hours, inserted directly (the service role skips the grid
// and the notice period). Tries each court until one is free at that time.
export async function insertBookingSoon(user: TestUser, hoursAhead = 2): Promise<{ bookingId: string; courtName: string }> {
  const admin = adminClient()
  const club = await clubRow(admin)
  const { data: courts, error } = await admin
    .from('courts')
    .select('id, name')
    .eq('club_id', club.id)
    .eq('is_active', true)
    .order('sort_order')
  if (error) throw error

  const start = new Date(Date.now() + hoursAhead * 3_600_000)
  start.setUTCSeconds(0, 0)
  const end = new Date(start.getTime() + club.slot_minutes * 60_000)
  const period = `[${start.toISOString()},${end.toISOString()})`

  for (const court of courts) {
    const occupancy = await admin
      .from('court_occupancy')
      .insert({ club_id: club.id, court_id: court.id, kind: 'booking', period, created_by: user.id })
      .select('id')
      .single()
    if (occupancy.error?.code === '23P01') continue
    if (occupancy.error) throw occupancy.error

    const booking = await admin
      .from('bookings')
      .insert({
        club_id: club.id,
        court_id: court.id,
        period,
        player_id: user.id,
        source: 'online',
        price: 1200,
        occupancy_id: occupancy.data.id,
        created_by: user.id,
      })
      .select('id')
      .single()
    if (booking.error) throw booking.error
    return { bookingId: booking.data.id, courtName: court.name }
  }
  throw new Error('No hay ninguna cancha libre en las próximas horas para preparar el test')
}

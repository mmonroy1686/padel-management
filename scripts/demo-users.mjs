// Creates (or refreshes) three demo members of Rustic in the LOCAL database: admin, reception and
// player, with complete profiles and a validated category. Sign in with the magic link: local
// emails arrive in Mailpit. Run after `npm run db:reset`.
import { createClient } from '@supabase/supabase-js'
import { localSupabase } from './local-supabase.mjs'

const DEMO = [
  { email: 'admin@rustic.test', name: 'Admin Demo', role: 'admin', side: 'both', hand: 'right', gender: 'female', category: 4 },
  { email: 'recepcion@rustic.test', name: 'Recepción Demo', role: 'reception', side: 'drive', hand: 'right', gender: 'male', category: 6 },
  { email: 'jugador@rustic.test', name: 'Jugador Demo', role: 'player', side: 'backhand', hand: 'left', gender: 'female', category: 5 },
]

const { apiUrl, serviceRoleKey, mailpitUrl } = localSupabase()
const admin = createClient(apiUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })

const { data: club, error: clubError } = await admin.from('clubs').select('id').eq('slug', 'rustic').single()
if (clubError) throw new Error('No está el club "rustic" en la base local. Corré `npm run db:reset` primero.')

const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 })
if (listError) throw listError

for (const demo of DEMO) {
  let user = list.users.find((existing) => existing.email === demo.email)
  if (!user) {
    const created = await admin.auth.admin.createUser({
      email: demo.email,
      email_confirm: true,
      user_metadata: { full_name: demo.name },
    })
    if (created.error) throw created.error
    user = created.data.user
  }

  const profile = await admin
    .from('profiles')
    .update({ display_name: demo.name, side: demo.side, hand: demo.hand, gender: demo.gender })
    .eq('id', user.id)
  if (profile.error) throw profile.error

  const member = await admin.from('club_members').upsert({
    club_id: club.id,
    user_id: user.id,
    role: demo.role,
    category: demo.category,
    category_validated: true,
  })
  if (member.error) throw member.error

  console.log(`${demo.role.padEnd(9)} ${demo.email}`)
}

console.log(`\nIngresá en http://localhost:3000/auth/ingreso con uno de esos emails.`)
console.log(`El enlace llega a Mailpit: ${mailpitUrl}`)

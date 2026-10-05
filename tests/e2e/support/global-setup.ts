import { adminClient, E2E_DOMAIN } from './admin'

// Removes what earlier e2e runs left in the local database: users @e2e.test and everything they
// booked, loaded or uploaded (including series bookings the daily job created with no author), and
// the matches they created or joined, the tournaments they created or signed up for, and the day use
// passes they created, bought or sold, and the courts held for them on the waitlist (their waits, holds
// and avisos go with the users, on delete cascade).
// adminClient only ever points at the local stack.
export default async function globalSetup(): Promise<void> {
  const admin = adminClient()
  const ids: string[] = []
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    ids.push(...data.users.filter((user) => user.email?.endsWith(`@${E2E_DOMAIN}`)).map((user) => user.id))
    if (data.users.length < 1000) break
  }
  if (ids.length === 0) return
  const idList = `(${ids.join(',')})`

  const series = await admin.from('recurring_series').select('id').in('created_by', ids)
  if (series.error) throw series.error
  const seriesIds = series.data.map((row) => row.id)
  const [spots, created] = await Promise.all([
    admin.from('match_slots').select('match_id').in('player_id', ids),
    admin.from('open_matches').select('id').in('created_by', ids),
  ])
  if (spots.error) throw spots.error
  if (created.error) throw created.error
  const matchIds = [...new Set([...spots.data.map((row) => row.match_id), ...created.data.map((row) => row.id)])]

  const filters = [`player_id.in.${idList}`, `created_by.in.${idList}`]
  if (seriesIds.length > 0) filters.push(`series_id.in.(${seriesIds.join(',')})`)
  if (matchIds.length > 0) filters.push(`match_id.in.(${matchIds.join(',')})`)
  const bookings = await admin.from('bookings').select('id, occupancy_id').or(filters.join(','))
  if (bookings.error) throw bookings.error
  const occupancyIds = bookings.data.flatMap((row) => (row.occupancy_id ? [row.occupancy_id] : []))
  // Waitlist: courts held for e2e players go free too.
  const holds = await admin.from('slot_holds').select('occupancy_id').in('player_id', ids).eq('status', 'active')
  if (holds.error) throw holds.error
  occupancyIds.push(...holds.data.flatMap((row) => (row.occupancy_id ? [row.occupancy_id] : [])))

  // Payments go with their bookings (on delete cascade).
  if (bookings.data.length > 0) await check(admin.from('bookings').delete().in('id', bookings.data.map((row) => row.id)))
  if (seriesIds.length > 0) await check(admin.from('recurring_series').delete().in('id', seriesIds))
  // Bookings went first (that clears open_matches.booking_id); the spots go with their matches.
  if (matchIds.length > 0) await check(admin.from('open_matches').delete().in('id', matchIds))
  // Tournaments take their entries, games, payments and occupancies with them (on delete cascade).
  // Entries of e2e players in other tournaments go too, so the users can be deleted.
  await check(admin.from('tournaments').delete().in('created_by', ids))
  await check(admin.from('tournament_entries').delete().in('player_id', ids))
  // Day use: passes of e2e players or sold by e2e staff (their payments go with them), then the
  // passes e2e admins created (their exceptions, occupancies and remaining passes go with them).
  await check(admin.from('day_use_passes').delete().or(`player_id.in.${idList},created_by.in.${idList}`))
  await check(admin.from('day_use_products').delete().in('created_by', ids))
  const occupancyFilter = [`created_by.in.${idList}`]
  if (occupancyIds.length > 0) occupancyFilter.push(`id.in.(${occupancyIds.join(',')})`)
  await check(admin.from('court_occupancy').delete().or(occupancyFilter.join(',')))

  for (const id of ids) {
    const files = await admin.storage.from('receipts').list(id)
    if (files.data && files.data.length > 0) {
      await admin.storage.from('receipts').remove(files.data.map((file) => `${id}/${file.name}`))
    }
    const deleted = await admin.auth.admin.deleteUser(id)
    if (deleted.error) throw deleted.error
  }
}

async function check(query: PromiseLike<{ error: unknown }>): Promise<void> {
  const { error } = await query
  if (error) throw error
}

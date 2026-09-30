import { addDays, localDateOf } from '../../../lib/domain/time'
import { adminClient, clubRow, type TestUser } from './admin'

// An earlier check-in of the player on that pass, `daysAgo` days back, inserted with the service role
// (check-in only works on the day of the pass, so a past stamp cannot be made through the app).
export async function addPastVisit(player: TestUser, productName: string, daysAgo = 1): Promise<void> {
  const admin = adminClient()
  const club = await clubRow(admin)
  const product = await admin.from('day_use_products').select('id, price').eq('club_id', club.id).eq('name', productName).single()
  if (product.error) throw product.error
  const { error } = await admin.from('day_use_passes').insert({
    club_id: club.id,
    product_id: product.data.id,
    on_date: addDays(localDateOf(new Date(), club.timezone), -daysAgo),
    player_id: player.id,
    price: product.data.price,
    code: `DU-${String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')}`,
    status: 'inside',
    source: 'online',
    checked_in_at: new Date().toISOString(),
  })
  if (error) throw error
}

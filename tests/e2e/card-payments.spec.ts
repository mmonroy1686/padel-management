import { expect, test } from '@playwright/test'
import { adminClient, clubRow, createMember } from './support/admin'
import { signInWithMagicLink } from './support/auth'

// In Pádel Norte, so turning POS on does not change the buttons other tests click in Rustic.
const NORTE = 'http://norte.localhost:3000'

// A booking that was played yesterday and owes everything: Cobros lists it under "Sin cobrar".
async function insertPlayedBooking(playerId: string, price: number): Promise<string> {
  const admin = adminClient()
  const club = await clubRow(admin, 'norte')
  const { data: court, error } = await admin.from('courts').select('id').eq('club_id', club.id).eq('is_active', true)
    .order('sort_order').limit(1).single()
  if (error) throw error
  const start = new Date(Math.floor((Date.now() - 26 * 3_600_000) / 3_600_000) * 3_600_000)
  for (let hour = 0; hour < 24; hour++) {
    const from = new Date(start.getTime() - hour * 3_600_000)
    const range = `[${from.toISOString()},${new Date(from.getTime() + 3_600_000).toISOString()})`
    const occupancy = await admin.from('court_occupancy')
      .insert({ club_id: club.id, court_id: court.id, kind: 'booking', period: range, created_by: playerId })
      .select('id').single()
    if (occupancy.error?.code === '23P01') continue
    if (occupancy.error) throw occupancy.error
    const booking = await admin.from('bookings')
      .insert({ club_id: club.id, court_id: court.id, period: range, player_id: playerId, source: 'online', price,
                occupancy_id: occupancy.data.id, created_by: playerId })
      .select('id').single()
    if (booking.error) throw booking.error
    return booking.data.id
  }
  throw new Error('No hay ninguna cancha libre ayer en Pádel Norte')
}

test.afterAll(async () => {
  const admin = adminClient()
  const { error } = await admin.from('clubs').update({ accepts_card: false }).eq('slug', 'norte')
  if (error) throw error
})

test('the admin turns POS on and reception charges a booking with POS in Cobros', async ({ page, browser }) => {
  const owner = await createMember({ name: 'Admin POS E2E', prefix: 'pos-admin', role: 'admin', club: 'norte' })
  const desk = await createMember({ name: 'Recepción POS E2E', prefix: 'pos-recepcion', role: 'reception', club: 'norte' })
  const player = await createMember({ name: 'Iris Tarjeta E2E', prefix: 'pos-jugadora', club: 'norte' })
  const bookingId = await insertPlayedBooking(player.id, 1500)

  // Ajustes → Pagos: POS on, next to cash and transfer.
  await signInWithMagicLink(page, owner.email, '/club/ajustes/pagos', NORTE)
  const pos = page.getByLabel('POS (tarjeta en recepción)')
  await expect(pos).not.toBeChecked()
  await pos.check()
  await page.getByRole('button', { name: 'Guardar pagos' }).click()
  await expect(page.getByRole('status')).toHaveText('Medios de pago guardados.')

  // Reception, on its own device: the booking owes, and Cobros offers cash and POS.
  const deskContext = await browser.newContext()
  const deskPage = await deskContext.newPage()
  await signInWithMagicLink(deskPage, desk.email, '/club/cobros', NORTE)
  const unpaid = deskPage.getByRole('region', { name: 'Sin cobrar', exact: true }).getByRole('article', { name: player.name })
  await expect(unpaid.getByRole('button', { name: 'Cobrar en efectivo' })).toBeVisible()
  await unpaid.getByRole('button', { name: 'Cobrar con POS' }).click()

  // Collected today, as POS, and not in the till's cash.
  const collected = deskPage.getByRole('region', { name: 'Cobrado hoy', exact: true })
  await expect(collected.getByRole('article', { name: player.name })).toContainText(/POS · \d{2}:\d{2}/)
  await expect(collected).toContainText('Por POS: $1.500')

  const { data: payments, error } = await adminClient().from('payments').select('method, amount, status').eq('booking_id', bookingId)
  if (error) throw error
  expect(payments).toEqual([{ method: 'card', amount: 1500, status: 'confirmed' }])
  await deskContext.close()
})

import { expect, test } from '@playwright/test'
import { addDays, localDateOf } from '../../lib/domain/time'
import { adminClient, clubRow, createMember } from './support/admin'
import { signInWithMagicLink } from './support/auth'
import { bookFirstFreeSlot } from './support/booking'

// Pádel Norte, the seed's second club, on its own subdomain.
const NORTE = 'http://norte.localhost:3000'

test('a player of Rustic enters Pádel Norte with the same account, signs up there and each club shows only its own', async ({ page }) => {
  const rustic = await clubRow()
  const player = await createMember({ name: 'Vera Dos Clubes E2E', prefix: 'dos-clubes', category: 5 })
  const day = addDays(localDateOf(new Date(), rustic.timezone), 2)
  const inRustic = await bookFirstFreeSlot(player, day)

  // First time in Norte: its brand, and its own welcome (membership and category are per club).
  await signInWithMagicLink(page, player.email, '/', NORTE)
  await expect(page).toHaveURL(new RegExp(`^${NORTE}/bienvenida`))
  await expect(page).toHaveTitle(/Pádel Norte/)
  await page.getByLabel('Categoría').selectOption('5ª')
  await page.getByRole('button', { name: 'Guardar y seguir' }).click()
  await expect(page).toHaveURL(`${NORTE}/`)

  // A booking in Norte, and a wait on Norte's list for later that day.
  const inNorte = await bookFirstFreeSlot(player, day, 'norte')
  const norte = await clubRow(undefined, 'norte')
  // Straight into the table: create_slot_wait only takes a range with every slot taken, and Norte has room.
  const wait = await adminClient()
    .from('slot_waits')
    .insert({ club_id: norte.id, player_id: player.id, on_date: day, from_time: '21:00', to_time: '23:00', court_ids: [] })
  expect(wait.error).toBeNull()

  // Norte's Inicio lists its booking and its wait, not the booking in Rustic.
  await page.goto(`${NORTE}/`)
  await expect(page.getByRole('heading', { name: 'Tus reservas' })).toBeVisible()
  const bookings = page.getByRole('listitem')
  await expect(bookings.filter({ hasText: `${inNorte.time} a` }).filter({ hasText: inNorte.courtName })).toHaveCount(1)
  await expect(bookings.filter({ hasText: inRustic.courtName })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Esperando turno' })).toBeVisible()

  // Rustic (localhost, the default club) asks her to sign in again — one session per club — and lists only its own.
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Tus reservas' })).toHaveCount(0)
  await signInWithMagicLink(page, player.email)
  await expect(page.getByRole('heading', { name: 'Tus reservas' })).toBeVisible()
  await expect(bookings.filter({ hasText: `${inRustic.time} a` }).filter({ hasText: inRustic.courtName })).toHaveCount(1)
  await expect(bookings.filter({ hasText: inNorte.courtName })).toHaveCount(0)
  // Norte's wait is Norte's: Rustic has nothing on its list for her.
  await expect(page.getByRole('heading', { name: 'Esperando turno' })).toHaveCount(0)
})

test('a subdomain without a club is a 404 that says so', async ({ page }) => {
  const response = await page.goto('http://no-existe.localhost:3000/')
  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: 'Club no encontrado' })).toBeVisible()
})

import { expect, test } from '@playwright/test'
import { addDays, localDateOf } from '../../lib/domain/time'
import { clubRow, createMember } from './support/admin'
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

  // A booking in Norte; Norte's Inicio lists it and not the one in Rustic.
  const inNorte = await bookFirstFreeSlot(player, day, 'norte')
  await page.goto(`${NORTE}/`)
  await expect(page.getByRole('heading', { name: 'Tus reservas' })).toBeVisible()
  const bookings = page.getByRole('listitem')
  await expect(bookings.filter({ hasText: `${inNorte.time} a` }).filter({ hasText: inNorte.courtName })).toHaveCount(1)
  await expect(bookings.filter({ hasText: inRustic.courtName })).toHaveCount(0)

  // Rustic (localhost, the default club) asks her to sign in again — one session per club — and lists only its own.
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Tus reservas' })).toHaveCount(0)
  await signInWithMagicLink(page, player.email)
  await expect(page.getByRole('heading', { name: 'Tus reservas' })).toBeVisible()
  await expect(bookings.filter({ hasText: `${inRustic.time} a` }).filter({ hasText: inRustic.courtName })).toHaveCount(1)
  await expect(bookings.filter({ hasText: inNorte.courtName })).toHaveCount(0)
})

test('a subdomain without a club is a 404 that says so', async ({ page }) => {
  const response = await page.goto('http://no-existe.localhost:3000/')
  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: 'Club no encontrado' })).toBeVisible()
})

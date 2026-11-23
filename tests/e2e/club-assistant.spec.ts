import { expect, test } from '@playwright/test'
import { addDays, localDateOf, weekdayOf } from '../../lib/domain/time'
import { clubRow, createMember } from './support/admin'
import { clearMatchesAt, setUsuallyFree } from './support/assistant'
import { signInWithMagicLink } from './support/auth'

test('reception builds a match on a free slot, invites a player and she gets the aviso', async ({ page }) => {
  const club = await clubRow()
  // Day 8, 17:00, Cancha 3: no other spec books it.
  const day = addDays(localDateOf(new Date(), club.timezone), 8)
  const reception = await createMember({ name: 'Recepción Asistente', prefix: 'asistente-recepcion', role: 'reception' })
  const lucia = await createMember({ name: 'Lucía Asistente', prefix: 'asistente-lucia', side: 'backhand', gender: 'female', category: 5 })
  await setUsuallyFree(lucia, weekdayOf(day), 'afternoon')
  await clearMatchesAt(day, '17:00')

  await signInWithMagicLink(page, reception.email, `/club/asistente?dia=${day}`)
  await expect(page.getByRole('heading', { name: 'Tablero de libres' })).toBeVisible()
  const flyer = await page.request.get(`/club/asistente/flyer?date=${day}`)
  expect(flyer.status()).toBe(200)
  expect(flyer.headers()['content-type']).toBe('image/png')

  await page.getByRole('button', { name: /^Armar partido · Cancha 3 · 17:00/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Armar partido · Cancha 3 · 17:00' })
  await sheet.getByLabel('Desde').selectOption('5')
  await sheet.getByLabel('Hasta').selectOption('5')
  await sheet.getByLabel('Tipo').selectOption('mixed')
  await expect(sheet.getByText('Lucía Asistente', { exact: true })).toBeVisible()
  await sheet.getByRole('button', { name: 'Crear partido' }).click()
  await sheet.getByRole('button', { name: 'Invitar a Lucía Asistente' }).click()
  await expect(sheet.getByText('Invitado ✓')).toBeVisible()

  await page.context().clearCookies()
  await signInWithMagicLink(page, lucia.email, '/avisos')
  await expect(page.getByText('Te invitan a un partido')).toBeVisible()
})

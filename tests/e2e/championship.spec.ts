import { expect, test } from '@playwright/test'
import { addDays, localDateOf } from '../../lib/domain/time'
import { clubRow, createMember } from './support/admin'
import { signInWithMagicLink } from './support/auth'
import { categoryIdByName, registerPairAs, uniquePhone, withdrawAs } from './support/championships'

// Next's dev indicator covers the bottom-left tab on mobile (fase 3a notes): navigate with page.goto.
test('campeonato: the organizer opens it, a member signs up with a partner from outside, the club charges and the line moves', async ({ page }) => {
  test.setTimeout(180_000)
  const club = await clubRow()
  // Day 20: past the booking window, so no other flow takes those courts.
  const day = addDays(localDateOf(new Date(), club.timezone), 20)
  const admin = await createMember({ name: 'Admin Campeonato', prefix: 'camp-admin', role: 'admin' })
  const ana = await createMember({ name: 'Ana Campeonato', prefix: 'camp-ana', gender: 'female' })
  const [bruno, carla, diego] = await Promise.all(
    ['Bruno', 'Carla', 'Diego'].map((name, index) => createMember({ name: `${name} Campeonato`, prefix: `camp-${index}` })),
  )

  // The organizer creates it: the data, a day of play and two categories of 2 pairs; then opens registration.
  await signInWithMagicLink(page, admin.email, '/club/torneos/campeonatos/nuevo')
  await page.getByLabel('Nombre').fill('Campeonato E2E')
  await page.getByRole('button', { name: 'Crear campeonato' }).click()
  await expect(page).toHaveURL(/\/club\/torneos\/campeonatos\/[0-9a-f-]{36}$/)
  const championshipId = new URL(page.url()).pathname.split('/').pop() ?? ''

  const days = page.getByRole('region', { name: 'Días de juego' })
  await days.getByLabel('Día').fill(day)
  await days.getByLabel('Desde').selectOption('08:00')
  await days.getByLabel('Hasta').selectOption('11:00')
  await days.getByRole('button', { name: 'Agregar día' }).click()
  await expect(days.getByRole('listitem')).toHaveCount(1)

  const categories = page.getByRole('region', { name: 'Categorías' })
  for (const name of ['6ta Libre', '5ta Damas']) {
    await categories.getByLabel('Nombre').fill(name)
    await categories.getByLabel('Mínimo de parejas').fill('2')
    await categories.getByLabel('Máximo de parejas').fill('2')
    await categories.getByRole('button', { name: 'Agregar categoría' }).click()
    await expect(categories.getByRole('listitem').filter({ hasText: name })).toBeVisible()
  }
  await page.getByRole('button', { name: 'Abrir inscripción' }).click()
  await expect(page.getByText('Inscripción abierta', { exact: true })).toBeVisible()

  // Ana signs up in 6ta Libre with a partner from outside.
  await page.context().clearCookies()
  await signInWithMagicLink(page, ana.email, `/campeonatos/${championshipId}`)
  await page.getByRole('button', { name: 'Anotarme en 6ta Libre' }).click()
  const sheet = page.getByRole('dialog', { name: 'Anotarme' })
  await sheet.getByLabel('Es de afuera').check()
  await sheet.getByLabel('Nombre y apellido').fill('Pedro Afuera')
  await sheet.getByLabel('Teléfono').fill(uniquePhone())
  await sheet.getByRole('button', { name: 'Anotarnos' }).click()
  const mine = page.getByRole('region', { name: 'Tus inscripciones' })
  await expect(mine).toContainText('Con Pedro Afuera')
  await expect(mine).toContainText('Pendiente de pago')

  // The club charges it in cash from the pairs table.
  await page.context().clearCookies()
  await signInWithMagicLink(page, admin.email, `/club/torneos/campeonatos/${championshipId}`)
  const libre = page.getByRole('region', { name: '6ta Libre' })
  const anaRow = libre.getByRole('row', { name: /Ana Campeonato y Pedro Afuera/ })
  await anaRow.getByRole('button', { name: 'Cobrar $2.000' }).click()
  await expect(anaRow).toContainText('Pagada')

  // Two more pairs through the API: the first fills the category, the second waits in line.
  const libreId = await categoryIdByName(championshipId, '6ta Libre')
  const second = await registerPairAs(bruno, libreId, { profileId: carla.id })
  expect(second.status).toBe('active')
  const third = await registerPairAs(diego, libreId, { name: 'Lucía Afuera', phone: uniquePhone() })
  expect(third.status).toBe('waiting')
  await page.reload()
  await expect(libre).toContainText('2 de 2 parejas · 1 en espera')
  await expect(libre.getByRole('row', { name: /Diego Campeonato y Lucía Afuera/ })).toContainText('En espera, puesto 1')

  // Bruno's pair withdraws: the pair in line gets the place by itself.
  await withdrawAs(bruno, second.id)
  await page.reload()
  await expect(libre).toContainText('2 de 2 parejas')
  await expect(libre).not.toContainText('en espera')
  await expect(libre.getByRole('row', { name: /Diego Campeonato y Lucía Afuera/ })).toContainText('Con lugar')
})

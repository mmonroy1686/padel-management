import { expect, test } from '@playwright/test'
import { addDays, localDateOf } from '../../lib/domain/time'
import { clubRow, createMember, uniqueEmail } from './support/admin'
import { signInWithMagicLink } from './support/auth'
import { createMatchAs } from './support/matches'

test('someone opens a shared match link without a session, signs up and joins', async ({ page }) => {
  const club = await clubRow()
  const day = addDays(localDateOf(new Date(), club.timezone), 6)
  const pablo = await createMember({ name: 'Pablo Link', prefix: 'link-pablo', side: 'drive' })
  const matchId = await createMatchAs(pablo, { day, time: '20:00', side: 'drive' })

  // The link asks to sign in first.
  await page.goto(`/partidos/${matchId}`)
  await expect(page).toHaveURL(/\/auth\/ingreso/)
  await signInWithMagicLink(page, uniqueEmail('link-sofia'), `/partidos/${matchId}`)

  // A new account goes through the welcome form and comes back to the match.
  await expect(page).toHaveURL(/\/bienvenida/)
  await page.getByLabel('Nombre').fill('Sofía Link')
  await page.getByLabel('Lado').selectOption('Revés')
  await page.getByLabel('Mano').selectOption('Diestro')
  await page.getByLabel('Género').selectOption('Femenino')
  await page.getByLabel('Categoría').selectOption('5ª')
  await page.getByRole('button', { name: 'Guardar y seguir' }).click()
  await expect(page).toHaveURL(new RegExp(`/partidos/${matchId}$`))

  await page.getByRole('button', { name: 'Sumarme de revés' }).first().click()
  const join = page.getByRole('dialog', { name: 'Sumarte de revés' })
  await expect(join).toContainText('Pablo Link')
  await join.getByRole('button', { name: 'Confirmar lugar' }).click()
  await expect(page.getByRole('status')).toContainText('Te sumaste al partido.')
  await expect(page.getByRole('group', { name: 'Cancha con 2 de 4 jugadores' })).toContainText('Vos')
})

import { expect, test } from '@playwright/test'
import { adminClient, clubRow, createMember, insertBookingSoon } from './support/admin'
import { signInWithMagicLink } from './support/auth'

test('a player loads the result of a booking she played, and sees it in her history', async ({ page }) => {
  const stamp = Date.now().toString().slice(-5)
  const ana = await createMember({ name: `Ana Resultado${stamp}`, prefix: 'resultado' })
  // Played two days ago (an odd hour, so it does not meet the other flows), with three partners named.
  const { bookingId } = await insertBookingSoon(ana, -(48 + Number(stamp) % 20))
  const club = await clubRow()
  const players = await adminClient()
    .from('booking_players')
    .insert(
      ['Bruno', 'Pedro', 'Juan'].map((name, index) => ({ booking_id: bookingId, club_id: club.id, position: index + 2, name })),
    )
  if (players.error) throw players.error

  await signInWithMagicLink(page, ana.email, '/perfil')
  await expect(page.getByRole('heading', { name: 'Tus podios' })).toBeVisible()
  await page.getByRole('link', { name: /Partidos jugados: 1/ }).click()
  await expect(page).toHaveURL(/\/perfil\/partidos$/)

  await page.getByText('Cargar resultado').click()
  await page.getByText('Bruno', { exact: true }).click()
  await page.getByLabel('Games de Ustedes en el set 1').fill('6')
  await page.getByLabel('Games de Pedro y Juan en el set 1').fill('4')
  await page.getByLabel('Games de Ustedes en el set 2').fill('6')
  await page.getByLabel('Games de Pedro y Juan en el set 2').fill('3')
  await page.getByRole('button', { name: 'Guardar resultado' }).click()
  await expect(page.getByText('Resultado guardado.')).toBeVisible()

  await page.reload()
  await expect(page.getByText('Ganaste', { exact: true })).toBeVisible()
  await expect(page.getByText('6-4 6-3')).toBeVisible()
  await expect(page.getByText('Ganaste 1 de 1 con resultado.', { exact: false })).toBeVisible()
})

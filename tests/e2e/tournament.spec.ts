import { expect, test } from '@playwright/test'
import { addDays, localDateOf } from '../../lib/domain/time'
import { clubRow, createMember } from './support/admin'
import { signInWithMagicLink } from './support/auth'
import { joinTournamentAs, recordMissingScoresAs } from './support/tournaments'

test('reception runs an americano: players and guests fill it, fixture, results and ranking', async ({ page }) => {
  test.setTimeout(120_000)
  const club = await clubRow()
  // Day 10 at 08:00: no other flow books then.
  const day = addDays(localDateOf(new Date(), club.timezone), 10)
  const reception = await createMember({ name: 'Recepción Torneo', prefix: 'torneo-recepcion', role: 'reception' })
  const players = await Promise.all(
    ['Ana', 'Bruno', 'Carla', 'Diego', 'Eva', 'Facu'].map((name, index) =>
      createMember({ name: `${name} Torneo`, prefix: `torneo-${index}`, gender: index % 2 === 0 ? 'female' : 'male' }),
    ),
  )

  // Reception creates it from the club panel: 8 players on the first two courts, 7 rounds of 20 min.
  await signInWithMagicLink(page, reception.email, '/club/torneos/nuevo')
  await page.getByLabel('Nombre').fill('Americano E2E')
  await page.getByLabel('Fecha').fill(day)
  await page.getByLabel('Hora').selectOption('08:00')
  await expect(page.getByText('Termina a las 10:20')).toBeVisible()
  await page.getByRole('button', { name: 'Crear americano' }).click()
  await expect(page).toHaveURL(/\/club\/torneos\/[0-9a-f-]{36}$/)
  const tournamentId = new URL(page.url()).pathname.split('/').pop() ?? ''

  // Six players sign up themselves (API); reception adds two guests from the screen.
  for (const player of players) await joinTournamentAs(player, tournamentId)
  await page.reload()
  for (const guest of ['Invitado Uno', 'Invitado Dos']) {
    await page.getByLabel('Nombre del invitado').fill(guest)
    await page.getByRole('button', { name: 'Agregar invitado' }).click()
    await expect(page.getByText(guest)).toBeVisible()
  }
  await expect(page.getByRole('heading', { name: 'Anotados (8 de 8)' })).toBeVisible()

  // Close registration and build the fixture.
  await page.getByRole('button', { name: 'Cerrar inscripción' }).click()
  await page.getByRole('button', { name: 'Armar fixture' }).click()
  await expect(page.getByText('Ronda 1 · en curso')).toBeVisible()

  // The first result from the screen (team B fills itself), the rest through the API.
  const firstGame = page.locator('form').filter({ has: page.getByLabel(/^Puntos de /) }).first()
  await firstGame.getByLabel(/^Puntos de /).fill('15')
  await expect(firstGame).toContainText(': 9')
  await firstGame.getByRole('button', { name: 'Guardar' }).click()
  await expect(firstGame.getByRole('status')).toHaveText('Resultado guardado.')
  expect(await recordMissingScoresAs(reception, tournamentId)).toBe(13)
  await page.reload()
  await page.getByRole('button', { name: 'Finalizar torneo' }).click()
  await expect(page.getByRole('heading', { name: 'Ranking final' })).toBeVisible()

  // A player sees the final ranking, all eight in it.
  await page.context().clearCookies()
  await signInWithMagicLink(page, players[0].email, `/torneos/${tournamentId}`)
  await expect(page.getByRole('heading', { name: 'Ranking final' })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Ranking' }).getByRole('row')).toHaveCount(9)
})

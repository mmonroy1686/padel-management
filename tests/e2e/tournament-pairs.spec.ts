import { expect, test } from '@playwright/test'
import { addDays, localDateOf } from '../../lib/domain/time'
import { clubRow, createMember } from './support/admin'
import { signInWithMagicLink } from './support/auth'
import { joinTournamentAs, recordMissingScoresAs } from './support/tournaments'

test('a fixed-pairs americano: pairs sign up, reception pairs the rest, and the ranking is per pair', async ({ page, browser }) => {
  test.setTimeout(150_000)
  const club = await clubRow()
  // Day 11 at 08:00: no other flow books then.
  const day = addDays(localDateOf(new Date(), club.timezone), 11)
  const stamp = Date.now().toString().slice(-5)
  const reception = await createMember({ name: 'Recepción Parejas', prefix: 'parejas-recepcion', role: 'reception' })
  const [ana, , carla, diego, eva, facu] = await Promise.all(
    ['Ana', 'Bruno', 'Carla', 'Diego', 'Eva', 'Facu'].map((name, index) =>
      createMember({ name: `${name} Pareja${stamp}`, prefix: `parejas-${index}`, gender: index % 2 === 0 ? 'female' : 'male' }),
    ),
  )

  // Reception creates it with fixed pairs: 4 pairs, every pair against every other (3 rounds).
  await signInWithMagicLink(page, reception.email, '/club/torneos/nuevo')
  await page.getByLabel('Nombre').fill('Parejas E2E')
  await page.getByLabel('Formato').selectOption('fixed_pairs')
  await expect(page.getByLabel('Rondas')).toHaveValue('3')
  await page.getByLabel('Fecha').fill(day)
  await page.getByLabel('Hora').selectOption('08:00')
  await expect(page.getByText('Termina a las 09:00')).toBeVisible()
  await page.getByRole('button', { name: 'Crear americano' }).click()
  await expect(page).toHaveURL(/\/club\/torneos\/[0-9a-f-]{36}$/)
  const tournamentId = new URL(page.url()).pathname.split('/').pop() ?? ''

  // Ana signs up with Bruno from her phone.
  const anaContext = await browser.newContext()
  const anaPage = await anaContext.newPage()
  await signInWithMagicLink(anaPage, ana.email, `/torneos/${tournamentId}`)
  await anaPage.getByRole('button', { name: /^Inscribirme/ }).click()
  await anaPage.getByRole('combobox', { name: 'Compañero' }).fill(`Bruno Pareja${stamp}`)
  await anaPage.getByRole('option', { name: `Bruno Pareja${stamp}` }).click()
  await anaPage.getByRole('button', { name: 'Confirmar inscripción' }).click()
  await expect(anaPage.getByText(`Tu pareja: Bruno Pareja${stamp}.`)).toBeVisible()
  await anaContext.close()

  // Four sign up alone, looking for a partner.
  for (const player of [carla, diego, eva, facu]) await joinTournamentAs(player, tournamentId)

  // Reception: a guest as Carla's partner, then Diego with Eva, then a guest for Facu.
  await page.reload()
  await page.getByLabel('Nombre del invitado').fill('Invitado Uno')
  await page.getByLabel('Pareja de').selectOption({ label: `Carla Pareja${stamp}` })
  await page.getByRole('button', { name: 'Agregar invitado' }).click()
  await expect(page.getByText('Invitado agregado como pareja.')).toBeVisible()
  await page.getByLabel(`Juntar a Diego Pareja${stamp} con`).selectOption({ label: `Con Eva Pareja${stamp}` })
  await page.getByRole('button', { name: `Juntar a Diego Pareja${stamp}` }).click()
  await expect(page.getByText('Listo, ya son pareja. Les avisamos.')).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Cerrar inscripción' }).click()
  await expect(page.getByRole('note').filter({ hasText: '1 anotado busca pareja' })).toBeVisible()
  await page.getByLabel('Nombre del invitado').fill('Invitado Dos')
  await page.getByLabel('Pareja de').selectOption({ label: `Facu Pareja${stamp}` })
  await page.getByRole('button', { name: 'Agregar invitado' }).click()
  await expect(page.getByRole('heading', { name: 'Anotados (8 de 8)' })).toBeVisible()

  // The fixture: every pair against every other, then the results.
  await page.getByRole('button', { name: 'Armar fixture' }).click()
  await expect(page.getByText('Ronda 1 · en curso')).toBeVisible()
  expect(await recordMissingScoresAs(reception, tournamentId)).toBe(6)
  await page.reload()
  await page.getByRole('button', { name: 'Finalizar torneo' }).click()
  await expect(page.getByRole('heading', { name: 'Ranking final' })).toBeVisible()
  const ranking = page.getByRole('table', { name: 'Ranking' })
  await expect(ranking.getByRole('row')).toHaveCount(5)
  await expect(ranking).toContainText(`Ana Pareja${stamp} y Bruno Pareja${stamp}`)
})

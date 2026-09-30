import { expect, test } from '@playwright/test'
import { addDays, localDateOf } from '../../lib/domain/time'
import { clubRow, createMember } from './support/admin'
import { signInWithMagicLink } from './support/auth'
import { joinMatchAs } from './support/matches'

test('a player creates a match, three more join and the court gets booked', async ({ page }) => {
  const club = await clubRow()
  const day = addDays(localDateOf(new Date(), club.timezone), 5)
  const ana = await createMember({ name: 'Ana Partido', prefix: 'partido-ana', side: 'drive' })
  const bruno = await createMember({ name: 'Bruno Partido', prefix: 'partido-bruno', side: 'backhand' })
  const carlos = await createMember({ name: 'Carlos Partido', prefix: 'partido-carlos', side: 'drive' })
  const diego = await createMember({ name: 'Diego Partido', prefix: 'partido-diego', side: 'backhand' })
  const reception = await createMember({ name: 'Recepción Partido', prefix: 'partido-recepcion', role: 'reception' })

  // Ana creates it from the app.
  await signInWithMagicLink(page, ana.email, '/partidos')
  await page.getByRole('button', { name: 'Armar partido' }).click()
  const sheet = page.getByRole('dialog', { name: 'Armar partido abierto' })
  await sheet.getByLabel('Día').selectOption(day)
  await sheet.getByLabel('Hora').selectOption('20:00')
  await sheet.getByRole('button', { name: 'Publicar partido' }).click()
  await expect(page).toHaveURL(/\/partidos\/[0-9a-f-]{36}$/)
  const matchId = new URL(page.url()).pathname.split('/').pop() ?? ''
  await expect(page.getByText('Faltan 3: 1 de drive y 2 de revés')).toBeVisible()

  // Two more join through the API.
  await joinMatchAs(bruno, matchId, 2)
  await joinMatchAs(carlos, matchId, 3)

  // Diego is the fourth, from the app: the court gets booked.
  await page.context().clearCookies()
  await signInWithMagicLink(page, diego.email, `/partidos/${matchId}`)
  await page.getByRole('button', { name: 'Sumarme de revés' }).click()
  const join = page.getByRole('dialog', { name: 'Sumarte de revés' })
  await expect(join).toContainText('Sos el cuarto')
  await join.getByRole('button', { name: 'Confirmar lugar' }).click()
  await expect(page.getByRole('status')).toContainText('Partido confirmado en la Cancha')

  // Reception sees the court taken by the match.
  await page.context().clearCookies()
  await signInWithMagicLink(page, reception.email, `/club/grilla?dia=${day}`)
  await expect(page.getByRole('button', { name: /, 20:00: Partido abierto$/ })).toBeVisible()
})

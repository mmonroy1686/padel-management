import { expect, test } from '@playwright/test'
import { addDays, localDateOf } from '../../lib/domain/time'
import { clubRow, createMember } from './support/admin'
import { signInWithMagicLink } from './support/auth'
import { addPastVisit } from './support/day-use'

// Next's dev indicator covers the bottom-left tab on mobile (fase 3a notes): navigate with page.goto.
test('day use: the club offers a pass, a player buys it, reception checks her in and the stamps pay off', async ({ page }) => {
  test.setTimeout(150_000)
  const club = await clubRow()
  const tomorrow = addDays(localDateOf(new Date(), club.timezone), 1)
  const name = `Day use E2E ${Date.now()}`
  const admin = await createMember({ name: 'Admin Day Use', prefix: 'dayuse-admin', role: 'admin' })
  const reception = await createMember({ name: 'Recepción Day Use', prefix: 'dayuse-recepcion', role: 'reception' })
  const player = await createMember({ name: 'Ana Day Use', prefix: 'dayuse-ana', gender: 'female' })

  // Admin: a stamp per visit, every 2 visits a free one.
  await signInWithMagicLink(page, admin.email, '/club/ajustes')
  const stamps = page.getByRole('region', { name: 'Sellos' })
  await stamps.getByLabel('Dar sellos por cada day use').check()
  await stamps.getByLabel('Day use para la recompensa').fill('2')
  await stamps.getByLabel('Descuento de la recompensa (%)').fill('100')
  await stamps.getByRole('button', { name: 'Guardar sellos' }).click()
  await expect(stamps.getByRole('status')).toHaveText('Sellos guardados.')

  // A pass every day, all day, that blocks no court (other flows book courts in parallel).
  await page.goto('/club/day-use/configuracion')
  const form = page.getByRole('region', { name: 'Nuevo pase' })
  await form.getByLabel('Nombre').fill(name)
  for (const day of ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']) await form.getByLabel(day, { exact: true }).check()
  await form.getByLabel('Desde').selectOption('00:00')
  await form.getByLabel('Hasta').selectOption('24:00')
  await form.getByRole('button', { name: 'Crear pase' }).click()
  await expect(form.getByRole('status')).toContainText('Pase guardado.')

  // The player buys today's pass and sees its QR.
  await page.context().clearCookies()
  await signInWithMagicLink(page, player.email, '/day-use')
  await page.getByRole('article', { name }).getByRole('button', { name: 'Comprar pase, $450' }).click()
  await page.getByRole('dialog', { name: 'Comprar pase' }).getByRole('button', { name: 'Confirmar compra' }).click()
  await expect(page).toHaveURL(/\/day-use\/pase\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('img', { name: 'Código QR del pase' })).toBeVisible()
  const code = ((await page.getByTestId('pass-code').textContent()) ?? '').trim()
  expect(code).toMatch(/^DU-\d{6}$/)

  // Reception opens the link the QR holds and checks her in.
  await page.context().clearCookies()
  await signInWithMagicLink(page, reception.email, `/club/day-use/pase/${code}`)
  await page.getByRole('button', { name: 'Registrar ingreso' }).click()
  await expect(page.getByText(/^Adentro desde las \d{2}:\d{2}\.$/)).toBeVisible()

  // The check-in is a stamp.
  await page.context().clearCookies()
  await signInWithMagicLink(page, player.email, '/day-use')
  await expect(page.getByText('1 de 2 sellos')).toBeVisible()

  // With an earlier visit the stamps are complete: tomorrow's pass is free.
  await addPastVisit(player, name)
  await page.goto(`/day-use?dia=${tomorrow}`)
  await expect(page.getByText(/Tenés 1 recompensa/)).toBeVisible()
  await page.getByRole('article', { name }).getByRole('button', { name: 'Usar mi recompensa (-100%)' }).click()
  const sheet = page.getByRole('dialog', { name: 'Comprar pase' })
  await expect(sheet).toContainText('Con tu recompensa (-100%): $0.')
  await sheet.getByRole('button', { name: 'Confirmar compra' }).click()
  await expect(page).toHaveURL(/\/day-use\/pase\/[0-9a-f-]{36}$/)
  await expect(page.getByText('Sin costo: usaste tu recompensa.')).toBeVisible()
})

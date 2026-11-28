import { expect, test } from '@playwright/test'
import { addDays, localDateOf } from '../../lib/domain/time'
import { clubRow, createMember } from './support/admin'
import { signInWithMagicLink } from './support/auth'

// The avisos of a player's own booking: the receipt when she books and when she cancels, in Avisos (and by mail).
test('a player books and cancels, and Avisos has a receipt for each', async ({ page }) => {
  const club = await clubRow()
  const player = await createMember({ name: `Aviso Turno${Date.now().toString().slice(-5)}`, prefix: 'avisos-turno' })
  await signInWithMagicLink(page, player.email, '/reservar')

  // Five days ahead: away from the other specs' bookings.
  const day = addDays(localDateOf(new Date(), club.timezone), 5)
  await page.goto(`/reservar?dia=${day}`)
  const slot = page.getByRole('button', { name: /^Reservar / }).last()
  const [, court] = /^Reservar (.+) a las (\d\d:\d\d)/.exec((await slot.getAttribute('aria-label')) ?? '') ?? []
  await slot.click()
  await page.getByRole('dialog', { name: 'Reservar cancha' }).getByRole('button', { name: 'Reservar', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Listo, reservaste la cancha')

  await page.goto('/avisos')
  await expect(page.getByText(`Reservaste la ${court}`)).toBeVisible()
  await expect(page.getByText(/por persona\./).first()).toBeVisible()

  // Cancel it from Inicio.
  await page.goto('/')
  await page.getByRole('button', { name: 'Cancelar reserva' }).first().click()
  await page.getByRole('dialog', { name: 'Cancelar reserva' }).getByRole('button', { name: 'Sí, cancelar' }).click()
  await expect(page.getByRole('button', { name: 'Cancelar reserva' })).toHaveCount(0)

  await page.goto('/avisos')
  await expect(page.getByText('Cancelaste tu turno')).toBeVisible()
})

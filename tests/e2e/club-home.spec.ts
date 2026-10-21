import { expect, test } from '@playwright/test'
import { createMember } from './support/admin'
import { signInWithMagicLink } from './support/auth'
import { insertPlayingBooking, paymentsOf } from './support/club-home'

test('reception charges each player of the court in play from the Inicio', async ({ page }) => {
  const holder = await createMember({ name: 'Lucía Inicio E2E', prefix: 'inicio-titular' })
  const partner = await createMember({ name: 'Tomás Inicio E2E', prefix: 'inicio-companero' })
  const reception = await createMember({ name: 'Recepción Inicio E2E', prefix: 'inicio-recepcion', role: 'reception' })
  const playing = await insertPlayingBooking(holder)
  test.skip(playing === null, 'El club está cerrado o el turno de ahora termina en menos de 5 minutos')
  if (!playing) return

  // /club opens the Inicio, and the court in play is there.
  await signInWithMagicLink(page, reception.email, '/club')
  await expect(page).toHaveURL(/\/club\/inicio$/)
  const inPlay = page.getByRole('region', { name: 'En cancha ahora' })
  const card = inPlay.getByRole('article').filter({ hasText: holder.name })
  await expect(card).toContainText(playing.courtName)
  await expect(card.getByRole('progressbar')).toBeVisible()

  // Completar jugadores: a member and a name; player 4 stays unnamed.
  await card.getByRole('button', { name: 'Completar jugadores' }).click()
  const sheet = page.getByRole('dialog', { name: 'Jugadores del turno' })
  await sheet.getByRole('combobox', { name: 'Jugador 2' }).fill('Tomás Inicio')
  await sheet.getByRole('option', { name: partner.name }).click()
  await sheet.getByRole('combobox', { name: 'Jugador 3' }).fill('Pepe E2E')
  await sheet.getByRole('button', { name: 'Guardar jugadores' }).click()
  await expect(card.getByRole('status')).toHaveText('Jugadores guardados.')
  const players = card.getByRole('list', { name: 'Jugadores' })
  await expect(players).toContainText(partner.name)
  await expect(players).toContainText('Pepe E2E')
  await expect(players).toContainText('Jugador 4')

  // His share in cash.
  await card.getByRole('button', { name: `Cobrar $300 a ${partner.name}` }).click()
  await card.getByRole('group', { name: `Cobrar $300 a ${partner.name}` }).getByRole('button', { name: 'Efectivo' }).click()
  await expect(card.getByRole('status')).toHaveText('Cobramos $300 en efectivo.')
  await expect(players.getByRole('listitem').filter({ hasText: partner.name })).toContainText('Pagó')

  // Everything left by transfer: the card is paid.
  await card.getByRole('button', { name: 'Cobrar todo lo que falta ($900)' }).click()
  await card.getByRole('group', { name: 'Cobrar todo lo que falta ($900)' }).getByRole('button', { name: 'Me transfirió' }).click()
  await expect(card.getByRole('status')).toHaveText('Cobramos $900 por transferencia.')
  await expect(players.getByText('Pagó', { exact: true })).toHaveCount(4)
  await expect(card.getByRole('button', { name: /^Cobrar/ })).toHaveCount(0)

  // Both are confirmed payments, the transfer without a receipt: Cobros has nothing to confirm for them.
  expect(await paymentsOf(playing.bookingId)).toEqual([
    { method: 'cash', amount: 300, status: 'confirmed', payer_position: 2, receipt_path: null },
    { method: 'transfer', amount: 900, status: 'confirmed', payer_position: null, receipt_path: null },
  ])
  await page.getByRole('link', { name: 'Cobros' }).click()
  await expect(page.getByRole('region', { name: 'Transferencias para confirmar' })).not.toContainText(holder.name)

  // The Grilla shows the same booking paid, with the same players.
  await page.getByRole('link', { name: 'Grilla' }).click()
  const cell = page.getByRole('button', { name: `${playing.courtName}, ${playing.time}: ${holder.name}` })
  await expect(cell).toContainText('Pagada')
  await cell.click()
  const detail = page.getByRole('dialog', { name: holder.name })
  await expect(detail.getByRole('list', { name: 'Jugadores' })).toContainText(partner.name)
  await expect(detail.getByText('Pagó', { exact: true })).toHaveCount(4)
})

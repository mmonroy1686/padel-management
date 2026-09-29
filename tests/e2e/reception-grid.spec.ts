import { expect, test, type Page } from '@playwright/test'
import { addDays, localDateOf } from '../../lib/domain/time'
import { clubRow, createMember } from './support/admin'
import { signInWithMagicLink } from './support/auth'
import { bookFirstFreeSlot, reportTransferAs } from './support/booking'

async function openFirstFreeSlot(page: Page): Promise<{ court: string; time: string }> {
  const free = page.getByRole('button', { name: /^Cargar / }).first()
  const [, court, time] = /^Cargar (.+), (\d\d:\d\d)$/.exec((await free.getAttribute('aria-label')) ?? '') ?? []
  await free.click()
  return { court, time }
}

test('reception confirms a transfer, loads a block and a recurring slot, and cancels a booking', async ({ page }) => {
  const club = await clubRow()
  const player = await createMember({ name: 'Martina E2E', prefix: 'flujo2-jugadora' })
  const reception = await createMember({ name: 'Recepción E2E', prefix: 'flujo2-recepcion', role: 'reception' })
  const day = addDays(localDateOf(new Date(), club.timezone), 4)
  const booked = await bookFirstFreeSlot(player, day)
  await reportTransferAs(player, booked.bookingId)

  // The booking is on the grid, with the transfer reported.
  await signInWithMagicLink(page, reception.email, `/club/grilla?dia=${day}`)
  const bookedCell = page.getByRole('button', { name: `${booked.courtName}, ${booked.time}: ${player.name}` })
  await expect(bookedCell).toContainText('Transferencia informada')

  // Confirm the payment in Cobros.
  await page.getByRole('link', { name: 'Cobros' }).click()
  const transfer = page
    .getByRole('region', { name: 'Transferencias para confirmar' })
    .getByRole('listitem')
    .filter({ hasText: player.name })
  await expect(transfer.getByRole('link', { name: 'Ver comprobante' })).toBeVisible()
  await transfer.getByRole('button', { name: 'Confirmar' }).click()
  await expect(transfer).toHaveCount(0)

  await page.goto(`/club/grilla?dia=${day}`)
  await expect(bookedCell).toContainText('Pagada')

  // Block the first free slot.
  const load = page.getByRole('dialog', { name: 'Cargar turno' })
  const blocked = await openFirstFreeSlot(page)
  await load.getByLabel('Tipo').selectOption('Bloqueo')
  await load.getByLabel('Motivo').fill('Mantenimiento')
  await load.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByRole('button', { name: `${blocked.court}, ${blocked.time}: Mantenimiento` })).toContainText('Bloqueo')

  // Load a recurring slot under a name.
  const recurring = await openFirstFreeSlot(page)
  await load.getByLabel('Tipo').selectOption('Turno fijo')
  await load.getByLabel('A nombre de', { exact: true }).fill('Rodríguez E2E')
  await load.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByRole('status')).toContainText('Turno fijo cargado')
  await expect(page.getByRole('button', { name: `${recurring.court}, ${recurring.time}: Rodríguez E2E` })).toContainText(
    'Turno fijo',
  )

  // Cancel the player's booking: the slot is free again.
  await bookedCell.click()
  await page.getByRole('dialog', { name: player.name }).getByRole('button', { name: 'Cancelar reserva' }).click()
  await expect(page.getByRole('button', { name: `Cargar ${booked.courtName}, ${booked.time}` })).toBeVisible()
})

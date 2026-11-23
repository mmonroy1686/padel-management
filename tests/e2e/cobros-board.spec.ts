import { expect, test } from '@playwright/test'
import { addDays, localDateOf } from '../../lib/domain/time'
import { clubRow, createMember } from './support/admin'
import { signInWithMagicLink } from './support/auth'
import { bookFirstFreeSlot, reportTransferAs } from './support/booking'
import { insertRecentBooking } from './support/club-home'

test('reception charges cash and confirms a transfer on the board, and both land in Cobrado hoy', async ({ page }) => {
  const club = await clubRow()
  const debtor = await createMember({ name: 'Paula Tablero E2E', prefix: 'tablero-deudora' })
  const payer = await createMember({ name: 'Tomás Tablero E2E', prefix: 'tablero-transfiere' })
  const reception = await createMember({ name: 'Recepción Tablero E2E', prefix: 'tablero-recepcion', role: 'reception' })
  const recent = await insertRecentBooking(debtor)
  test.skip(recent === null, 'El turno de hace un rato habría empezado ayer')
  const booked = await bookFirstFreeSlot(payer, addDays(localDateOf(new Date(), club.timezone), 4))
  await reportTransferAs(payer, booked.bookingId)

  await signInWithMagicLink(page, reception.email, '/club/cobros')
  const column = (name: string) => page.getByRole('region', { name, exact: true })

  // Cash on a Sin cobrar card: once the page refreshes, the card sits in Cobrado hoy.
  await column('Sin cobrar').getByRole('article', { name: debtor.name }).getByRole('button', { name: 'Cobrar en efectivo' }).click()
  await expect(column('Cobrado hoy').getByRole('article', { name: debtor.name })).toContainText('Efectivo')
  await expect(column('Sin cobrar').getByRole('article', { name: debtor.name })).toHaveCount(0)

  // A reported transfer: confirmed in its sheet, it leaves Por confirmar for Cobrado hoy.
  await column('Por confirmar').getByRole('button', { name: `Revisar la transferencia de ${payer.name}` }).click()
  const review = page.getByRole('dialog', { name: `Transferencia de ${payer.name}` })
  await review.getByRole('button', { name: 'Confirmar' }).click()
  await expect(review.getByRole('status')).toContainText('Pago confirmado')
  await review.getByRole('button', { name: 'Cerrar' }).click()
  await expect(column('Por confirmar').getByRole('article', { name: payer.name })).toHaveCount(0)
  await expect(column('Cobrado hoy').getByRole('article', { name: payer.name })).toContainText('Transferencia')
})

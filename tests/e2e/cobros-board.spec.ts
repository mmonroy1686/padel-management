import { expect, test } from '@playwright/test'
import { addDays, localDateOf } from '../../lib/domain/time'
import { clubRow, createMember } from './support/admin'
import { signInWithMagicLink } from './support/auth'
import { bookFirstFreeSlot, reportTransferAs } from './support/booking'
import { insertRecentBooking } from './support/club-home'

test('reception charges cash, confirms a transfer and rejects another on the board', async ({ page }) => {
  const club = await clubRow()
  const debtor = await createMember({ name: 'Paula Tablero E2E', prefix: 'tablero-deudora' })
  const payer = await createMember({ name: 'Tomás Tablero E2E', prefix: 'tablero-transfiere' })
  const rejected = await createMember({ name: 'Rita Tablero E2E', prefix: 'tablero-rechazada' })
  const reception = await createMember({ name: 'Recepción Tablero E2E', prefix: 'tablero-recepcion', role: 'reception' })
  const recent = await insertRecentBooking(debtor)
  test.skip(recent === null, 'El turno de hace un rato habría empezado ayer')
  const booked = await bookFirstFreeSlot(payer, addDays(localDateOf(new Date(), club.timezone), 4))
  await reportTransferAs(payer, booked.bookingId)
  const unfunded = await bookFirstFreeSlot(rejected, addDays(localDateOf(new Date(), club.timezone), 5))
  await reportTransferAs(rejected, unfunded.bookingId)

  await signInWithMagicLink(page, reception.email, '/club/cobros')
  const column = (name: string) => page.getByRole('region', { name, exact: true })

  // Cash on a Sin cobrar card: once the page refreshes, the card sits in Cobrado hoy.
  // Cobrar asks how the player paid, as on Inicio.
  const debt = column('Sin cobrar').getByRole('article', { name: debtor.name })
  await debt.getByRole('button', { name: new RegExp(`^Cobrar .* a ${debtor.name}$`) }).click()
  await debt.getByRole('group').getByRole('button', { name: 'Efectivo' }).click()
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

  // Another one rejected with a reason: it leaves Por confirmar for Rechazado hoy, with the reason.
  await column('Por confirmar').getByRole('button', { name: `Revisar la transferencia de ${rejected.name}` }).click()
  const rejection = page.getByRole('dialog', { name: `Transferencia de ${rejected.name}` })
  await rejection.getByRole('button', { name: 'Rechazar', exact: true }).click()
  await rejection.getByLabel('Motivo').fill('No llegó a la cuenta')
  await rejection.getByRole('button', { name: 'Rechazar transferencia' }).click()
  await rejection.getByRole('button', { name: '¿Seguro? Tocá de nuevo' }).click()
  await expect(rejection.getByRole('status')).toBeVisible()
  await rejection.getByRole('button', { name: 'Cerrar' }).click()
  await expect(column('Rechazado hoy').getByRole('article', { name: rejected.name })).toContainText('No llegó a la cuenta')

  // The summary stays on top; its tile opens the Devolver lane.
  await page.getByRole('navigation', { name: 'Resumen de cobros' }).getByRole('button', { name: /A devolver/ }).click()
  await expect(column('A devolver')).toBeVisible()
})

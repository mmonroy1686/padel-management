import { expect, test } from '@playwright/test'
import { cancellationRule } from '../../lib/domain/cancellation'
import { paymentMethodsNote } from '../../lib/domain/payments'
import { addDays, localDateOf } from '../../lib/domain/time'
import { clubRow, uniqueEmail } from './support/admin'
import { signInWithMagicLink } from './support/auth'
import { RECEIPT_FILE } from './support/files'

// Reads the club's own settings, so the flow keeps passing when Rustic's real data replaces the seed.
test('a new player signs up, books a court, sees it and reports the transfer', async ({ page }) => {
  const club = await clubRow()
  await signInWithMagicLink(page, uniqueEmail('flujo1'), '/reservar')

  // Mandatory welcome form before booking.
  await expect(page).toHaveURL(/\/bienvenida/)
  await page.getByLabel('Nombre').fill('Lucía E2E')
  await page.getByLabel('Lado').selectOption('Revés')
  await page.getByLabel('Mano').selectOption('Diestro')
  await page.getByLabel('Género').selectOption('Femenino')
  await page.getByLabel('Categoría').selectOption('5ª')
  await page.getByRole('button', { name: 'Guardar y seguir' }).click()
  await expect(page).toHaveURL(/\/reservar/)

  // Book the first free slot three days ahead.
  const day = addDays(localDateOf(new Date(), club.timezone), 3)
  await page.goto(`/reservar?dia=${day}`)
  const slot = page.getByRole('button', { name: /^Reservar / }).first()
  const [, court, time] = /^Reservar (.+) a las (\d\d:\d\d)/.exec((await slot.getAttribute('aria-label')) ?? '') ?? []
  await slot.click()

  const sheet = page.getByRole('dialog', { name: 'Reservar cancha' })
  await expect(sheet).toContainText(paymentMethodsNote(club))
  await expect(sheet).toContainText(cancellationRule(club.cancellation_notice_hours))
  await sheet.getByRole('button', { name: 'Reservar', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Listo, reservaste la cancha')

  // The booking shows up in Inicio, pending payment.
  // Straight to /: in dev, the Next indicator covers the Inicio tab on a phone.
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Tus reservas' })).toBeVisible()
  const card = page.getByRole('listitem').filter({ hasText: `${time} a` }).filter({ hasText: court })
  await expect(card).toContainText('Pendiente de pago')

  // Report the transfer with the receipt.
  await card.getByRole('button', { name: 'Ya transferí' }).click()
  const transfer = page.getByRole('dialog', { name: 'Ya transferí' })
  await expect(transfer).toContainText(club.transfer_details ?? 'El club todavía no cargó')
  await transfer.getByLabel('Comprobante').setInputFiles(RECEIPT_FILE)
  await transfer.getByRole('button', { name: 'Informar transferencia' }).click()
  await expect(card).toContainText('Transferencia informada')
})

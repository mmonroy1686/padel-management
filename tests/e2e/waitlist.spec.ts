import { expect, test } from '@playwright/test'
import { addDays, localDateOf } from '../../lib/domain/time'
import { clubRow, createMember, signedInClient } from './support/admin'
import { signInWithMagicLink } from './support/auth'
import { bookFirstFreeSlot } from './support/booking'

// Next's dev indicator covers the bottom-left tab on mobile (fase 3a notes): navigate with page.goto.
test('waitlist: a player waits for a taken slot, it is held for her when it frees up, and she books it', async ({ page }) => {
  test.setTimeout(120_000)
  const club = await clubRow()
  const day = addDays(localDateOf(new Date(), club.timezone), 3)
  const holder = await createMember({ name: 'Titular Espera', prefix: 'espera-titular' })
  const waiter = await createMember({ name: 'Paula Espera', prefix: 'espera-paula', gender: 'female' })
  const reception = await createMember({ name: 'Recepción Espera', prefix: 'espera-recepcion', role: 'reception' })
  const booked = await bookFirstFreeSlot(holder, day)

  // The waiter taps the taken slot and signs up for it.
  await signInWithMagicLink(page, waiter.email, `/reservar?dia=${day}`)
  await page.getByRole('button', { name: `Avisame si se libera ${booked.courtName} a las ${booked.time}` }).click()
  const sheet = page.getByRole('dialog', { name: 'Avisame si se libera' })
  await expect(sheet.getByLabel('Desde')).toHaveValue(booked.time)
  await expect(sheet.getByLabel(booked.courtName)).toBeChecked()
  await sheet.getByRole('button', { name: 'Anotarme' }).click()
  await expect(page.getByRole('status')).toContainText('te anotamos')
  // The screen keeps a mark: the note for that day and a bell on the slot.
  await expect(page.getByRole('region', { name: 'Te avisamos si se libera' })).toBeVisible()
  await expect(page.getByRole('button', { name: `Te avisamos si se libera ${booked.courtName} a las ${booked.time}` })).toBeVisible()

  // Reception cancels the booking: the slot is held for her, with an aviso.
  const desk = await signedInClient(reception)
  const cancelled = await desk.rpc('cancel_booking', { p_booking_id: booked.bookingId })
  expect(cancelled.error).toBeNull()

  await page.goto('/')
  const banner = page.getByRole('region', { name: 'Turno retenido' })
  await expect(banner).toContainText(`Se liberó la ${booked.courtName}`)
  await expect(banner).toContainText(`a las ${booked.time}`)
  await expect(page.getByRole('link', { name: 'Avisos, 1 sin leer' })).toBeVisible()

  // She books it: one more booking, waiting for payment.
  await banner.getByRole('button', { name: 'Reservar' }).click()
  await page.getByRole('dialog', { name: 'Reservar turno' }).getByRole('button', { name: 'Confirmar reserva' }).click()
  await expect(banner).toHaveCount(0)
  const mine = page.getByRole('region', { name: 'Tus reservas' })
  await expect(mine).toContainText(booked.courtName)
  await expect(mine).toContainText('Pendiente de pago')

  // The aviso stays in Avisos, and opening it quiets the bell.
  await page.goto('/avisos')
  await expect(page.getByRole('link', { name: new RegExp(`Se liberó tu turno: .*${booked.time}, ${booked.courtName}`) })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Avisos', exact: true })).toBeVisible()
})

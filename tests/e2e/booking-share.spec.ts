import { expect, test } from '@playwright/test'
import { createMember, insertBookingSoon } from './support/admin'
import { signInWithMagicLink } from './support/auth'

test('a player shares her booking by WhatsApp and another member joins from the link', async ({ page, browser }) => {
  const stamp = Date.now().toString().slice(-5)
  const ana = await createMember({ name: `Ana Comparte${stamp}`, prefix: 'comparte-ana' })
  const bruno = await createMember({ name: `Bruno Sesuma${stamp}`, prefix: 'comparte-bruno' })
  // Two to five days ahead, at the first hour with a free court (the local demo data books many).
  let bookingId = ''
  for (let hours = 48 + (Number(stamp) % 20); !bookingId && hours < 120; hours += 7) {
    bookingId = await insertBookingSoon(ana, hours).then((booked) => booked.bookingId).catch(() => '')
  }
  expect(bookingId).not.toBe('')

  // Ana's booking on Inicio: «Buscar jugadores» opens WhatsApp with the link to the booking.
  await signInWithMagicLink(page, ana.email, '/')
  const share = page.getByRole('link', { name: 'Buscar jugadores' }).first()
  await expect(share).toBeVisible()
  const href = decodeURIComponent((await share.getAttribute('href')) ?? '')
  expect(href).toMatch(/^https:\/\/wa\.me\/\?text=/)
  expect(href).toContain(`/turno/${bookingId}`)

  // Bruno opens the link: three spots free, «Me sumo».
  const other = await browser.newContext()
  const brunoPage = await other.newPage()
  await signInWithMagicLink(brunoPage, bruno.email, `/turno/${bookingId}`)
  await expect(brunoPage.getByRole('heading', { name: 'Faltan 3', level: 1 })).toBeVisible()
  await brunoPage.getByRole('button', { name: 'Me sumo' }).click()
  await expect(brunoPage.getByText(/^Estás en este turno/)).toBeVisible()
  await brunoPage.reload()
  await expect(brunoPage.getByRole('heading', { name: 'Faltan 2', level: 1 })).toBeVisible()
  await expect(brunoPage.getByRole('list', { name: 'Jugadores' })).toContainText(`Bruno Sesuma${stamp}`)
  // He is in: now he can share it too, and pay his share (never the whole court) by transfer.
  await expect(brunoPage.getByRole('link', { name: 'Compartir por WhatsApp' })).toBeVisible()
  await expect(brunoPage.getByText(/por persona/)).toBeVisible()
  await expect(brunoPage.getByRole('button', { name: /^Transferir mi parte, \$/ })).toBeVisible()
  await other.close()

  // Ana got the aviso.
  await page.goto('/avisos')
  await expect(page.getByText(`Bruno Sesuma${stamp} se sumó a tu turno`)).toBeVisible()
})

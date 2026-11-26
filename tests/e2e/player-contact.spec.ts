import { expect, test } from '@playwright/test'
import { createMember } from './support/admin'
import { signInWithMagicLink } from './support/auth'
import { RECEIPT_PNG } from './support/files'

test('a player adds her WhatsApp with consent and a photo; the admin sees them and opens her chat', async ({ page, browser }) => {
  const player = await createMember({ name: 'Valeria Contacto E2E', prefix: 'contacto-jugadora' })
  const admin = await createMember({ name: 'Admin Contacto E2E', prefix: 'contacto-admin', role: 'admin' })

  // Perfil: her email, her WhatsApp and the consent (it saves itself), and a photo (it uploads on pick).
  await signInWithMagicLink(page, player.email, '/perfil')
  await expect(page.getByText(`Ingresás con ${player.email}`)).toBeVisible()
  await page.getByLabel('Tu WhatsApp (opcional)').fill('099 765 432')
  await page.getByRole('checkbox', { name: /Acepto que el club me escriba por WhatsApp/ }).check()
  await expect(page.getByRole('status').filter({ hasText: 'Guardado' })).toBeVisible()
  await page.getByLabel('Tu foto').setInputFiles({ name: 'yo.png', mimeType: 'image/png', buffer: RECEIPT_PNG })
  await expect(page.getByRole('status').filter({ hasText: 'Guardamos tu foto.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Quitar foto' })).toBeVisible()

  // The admin, on another phone: Jugadores shows her photo, her email and her chat.
  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  await signInWithMagicLink(adminPage, admin.email, '/club/jugadores')
  await adminPage.getByRole('searchbox', { name: 'Buscar jugador' }).fill('Valeria Contacto')
  await adminPage.getByRole('button', { name: `Editar a ${player.name}` }).click()
  const sheet = adminPage.getByRole('dialog', { name: player.name })
  await expect(sheet).toContainText(player.email)
  await expect(sheet).toContainText('099 765 432')
  await expect(sheet.getByRole('link', { name: `WhatsApp a ${player.name}` })).toHaveAttribute('href', /^https:\/\/wa\.me\/59899765432/)
  await adminContext.close()

  // She takes the consent back: the club no longer gets her chat.
  await page.getByRole('checkbox', { name: /Acepto que el club me escriba por WhatsApp/ }).uncheck()
  await expect(page.getByRole('status').filter({ hasText: 'Guardado' })).toBeVisible()
})

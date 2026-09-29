import { expect, test } from '@playwright/test'

test('a visitor reaches sign-in and asks for a magic link', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Rustic Pádel' })).toBeVisible()

  await page.getByRole('link', { name: 'Ingresar' }).click()
  await expect(page).toHaveURL(/\/auth\/ingreso$/)

  await page.getByLabel('Email').fill(`smoke+${Date.now()}@example.com`)
  await page.getByRole('button', { name: 'Enviarme el enlace' }).click()

  await expect(page.getByRole('status')).toContainText('Revisá tu email')
})

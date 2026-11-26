import { expect, test } from '@playwright/test'

test('a visitor reaches sign-in: Google first, then a code by email', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Rustic Pádel' })).toBeVisible()

  await page.getByRole('link', { name: 'Ingresar' }).click()
  await expect(page).toHaveURL(/\/auth\/ingreso$/)
  await expect(page.getByRole('button').first()).toHaveText('Seguir con Google')

  await page.getByLabel('Email').fill(`smoke+${Date.now()}@example.com`)
  await page.getByRole('button', { name: 'Mandarme un código' }).click()

  await expect(page.getByRole('status')).toContainText('Te mandamos un mail')
  await expect(page.getByLabel('Código del mail')).toBeVisible()
})

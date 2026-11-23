import { expect, test } from '@playwright/test'

test('the terms and the privacy policy are one tap away from the sign-in, without a session', async ({ page }) => {
  await page.goto('/auth/ingreso')
  await page.getByRole('link', { name: 'Términos y condiciones' }).click()
  await expect(page.getByRole('heading', { name: 'Términos y condiciones', level: 1 })).toBeVisible()

  await page.goto('/auth/ingreso')
  await page.getByRole('link', { name: 'Política de privacidad' }).click()
  await expect(page.getByRole('heading', { name: 'Política de privacidad', level: 1 })).toBeVisible()
  // Still a draft: the gaps are flagged until Miguel fills them.
  await expect(page.getByRole('note')).toContainText('Borrador')
})

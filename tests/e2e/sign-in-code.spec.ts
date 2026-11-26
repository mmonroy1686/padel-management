import { expect, test } from '@playwright/test'
import { createMember } from './support/admin'
import { signInWithCode } from './support/auth'

test('a player types the code from the mail and lands where she was going', async ({ page }) => {
  const player = await createMember({ name: 'Paula Código E2E', prefix: 'codigo-jugadora' })
  await signInWithCode(page, player.email, '/perfil')
  await expect(page).toHaveURL(/\/perfil$/)
  await expect(page.getByText(`Ingresás con ${player.email}`)).toBeVisible()
})

test('the staff types the code and lands on the panel', async ({ page }) => {
  const staff = await createMember({ name: 'Mostrador Código E2E', prefix: 'codigo-mostrador', role: 'reception' })
  await signInWithCode(page, staff.email)
  await expect(page).toHaveURL(/\/club\/inicio$/)
})

test('a wrong code says so and lets her try again', async ({ page }) => {
  const player = await createMember({ name: 'Rita Código E2E', prefix: 'codigo-error' })
  await page.goto('/auth/ingreso')
  await page.getByLabel('Email').fill(player.email)
  await page.getByRole('button', { name: 'Mandarme un código' }).click()
  await page.getByLabel('Código del mail').fill('000000')
  await expect(page.getByRole('alert').filter({ hasText: 'El código no es correcto o venció' })).toBeVisible()
  await expect(page.getByLabel('Código del mail')).toBeVisible()
})

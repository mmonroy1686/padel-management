import { expect, test } from '@playwright/test'
import { adminClient, createMember } from './support/admin'
import { signInWithMagicLink } from './support/auth'

// Without NEXT_PUBLIC_SENTRY_DSN (CI, local) both checks say Sentry is off; with it they give the event's id.
// Monitoreo is for the platform admin (the developer): a club admin gets a 404.
test('the platform admin checks the error monitoring from the server and from the browser', async ({ page }) => {
  const admin = await createMember({ name: 'Admin Monitoreo', prefix: 'monitoreo-admin', role: 'admin' })
  const granted = await adminClient().from('platform_admins').insert({ user_id: admin.id })
  if (granted.error) throw granted.error
  await signInWithMagicLink(page, admin.email, '/club/ajustes/monitoreo')
  await expect(page.getByRole('heading', { name: 'Probar el monitoreo de errores' })).toBeVisible()

  const off = 'Sentry está apagado acá: falta NEXT_PUBLIC_SENTRY_DSN en Vercel (y volver a desplegar).'
  await page.getByRole('button', { name: 'Probar desde el servidor' }).click()
  await expect(page.getByRole('alert').filter({ hasText: off })).toHaveCount(1)
  await page.getByRole('button', { name: 'Probar desde el navegador' }).click()
  await expect(page.getByRole('alert').filter({ hasText: off })).toHaveCount(2)
})

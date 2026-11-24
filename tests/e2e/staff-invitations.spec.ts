import { expect, test } from '@playwright/test'
import { createMember, uniqueEmail } from './support/admin'
import { signInWithMagicLink } from './support/auth'

test('the admin invites reception, who enters through the link straight to the panel; a cancelled one gives no access', async ({
  page,
}) => {
  const admin = await createMember({ name: 'Admin Staff', prefix: 'staff-admin', role: 'admin' })
  const reception = uniqueEmail('staff-recepcion')
  const cancelled = uniqueEmail('staff-cancelada')

  // The admin invites two emails as reception and cancels the second one.
  await signInWithMagicLink(page, admin.email, '/club/ajustes/staff')
  for (const email of [reception, cancelled]) {
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Rol').selectOption('reception')
    await page.getByRole('button', { name: 'Invitar', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: `Invitamos a ${email} como recepción` })).toBeVisible()
  }
  // Only this test's invitations: the club may have others.
  const open = page.getByRole('list', { name: 'Invitaciones abiertas' })
  const invitationOf = (email: string) => open.getByRole('listitem').filter({ hasText: email })
  await expect(invitationOf(reception)).toHaveCount(1)
  await expect(invitationOf(cancelled)).toHaveCount(1)
  await open.getByRole('button', { name: `Cancelar la invitación de ${cancelled}` }).click()
  await expect(invitationOf(cancelled)).toHaveCount(0)
  await expect(invitationOf(reception)).toHaveCount(1)

  // The mail's link without a session says what to do and leads to signing in, back to the invitation.
  await page.context().clearCookies()
  await page.goto('/invitacion')
  await expect(page.getByText('te invitó a su staff')).toBeVisible()
  await page.getByRole('link', { name: 'Entrar para aceptar' }).click()
  await expect(page).toHaveURL(/\/auth\/ingreso\?next=%2Finvitacion$/)

  // Reception signs in for the first time from the invitation: no welcome, straight to the panel.
  await signInWithMagicLink(page, reception, '/invitacion')
  await expect(page.getByRole('heading', { name: 'Invitación' })).toBeVisible()
  await page.getByRole('button', { name: 'Aceptar invitación' }).click()
  await expect(page).toHaveURL(/\/club(\/|$)/)
  await page.goto('/')
  await expect(page).toHaveURL(/\/club(\/|$)/)
  // Reception cannot manage the staff.
  await page.goto('/club/ajustes/staff')
  await expect(page).not.toHaveURL(/\/club\/ajustes/)

  // The cancelled invitation gives no access.
  await page.context().clearCookies()
  await signInWithMagicLink(page, cancelled, '/invitacion')
  await page.getByRole('button', { name: 'Aceptar invitación' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'No encontramos una invitación vigente para tu email.' })).toBeVisible()
  await page.goto('/club')
  await expect(page).not.toHaveURL(/\/club(\/|$)/)

  // Back as the admin: the new reception is on the staff list and the invitation is gone.
  await page.context().clearCookies()
  await signInWithMagicLink(page, admin.email, '/club/ajustes/staff')
  await expect(page.getByRole('list', { name: 'Staff del club' })).toContainText(reception)
  await expect(page.getByRole('listitem').filter({ hasText: reception })).toHaveCount(1)
  await expect(page.getByRole('list', { name: 'Invitaciones abiertas' }).filter({ hasText: reception })).toHaveCount(0)
})

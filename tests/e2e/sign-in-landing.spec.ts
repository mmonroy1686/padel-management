import { expect, test } from '@playwright/test'
import { createMember } from './support/admin'
import { signInWithMagicLink } from './support/auth'

// After the magic link, the club's staff land on the panel; players on their Inicio. A page someone asked for wins.
test('the staff land on the panel, players on their Inicio', async ({ browser }) => {
  const admin = await createMember({ name: 'Admin Ingreso E2E', prefix: 'ingreso-admin', role: 'admin' })
  const reception = await createMember({ name: 'Recepción Ingreso E2E', prefix: 'ingreso-recepcion', role: 'reception' })
  const player = await createMember({ name: 'Jugadora Ingreso E2E', prefix: 'ingreso-jugadora' })

  for (const [member, landing] of [
    [admin, /\/club\/inicio$/],
    [reception, /\/club\/inicio$/],
    [player, /\/$/],
  ] as const) {
    const context = await browser.newContext()
    const page = await context.newPage()
    await signInWithMagicLink(page, member.email, '/')
    await expect(page).toHaveURL(landing)
    await context.close()
  }

  // Asked for a page: there it goes, staff or not.
  const context = await browser.newContext()
  const page = await context.newPage()
  await signInWithMagicLink(page, admin.email, '/reservar')
  await expect(page).toHaveURL(/\/reservar$/)
  await context.close()
})

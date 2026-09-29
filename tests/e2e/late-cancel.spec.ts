import { expect, test } from '@playwright/test'
import { createMember, insertBookingSoon } from './support/admin'
import { signInWithMagicLink } from './support/auth'

test('a player cannot cancel inside the notice period and sees why', async ({ page }) => {
  const player = await createMember({ name: 'Tomás E2E', prefix: 'flujo3' })
  const { courtName } = await insertBookingSoon(player)

  await signInWithMagicLink(page, player.email, '/reservas')
  await expect(page).toHaveURL(/\/reservas/)

  const card = page.getByRole('listitem').filter({ hasText: courtName }).filter({ hasText: 'Pendiente de pago' })
  await expect(card).toContainText('Ya no se puede cancelar: faltan menos de 24 h')
  await expect(card.getByRole('button', { name: 'Cancelar reserva' })).toHaveCount(0)
})

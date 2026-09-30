import { expect, test } from '@playwright/test'
import { CANCEL_REASON_TEXT } from '../../lib/domain/matches'
import { addDays, localDateOf } from '../../lib/domain/time'
import { adminClient, clubRow, createMember } from './support/admin'
import { signInWithMagicLink } from './support/auth'
import { createMatchAs, moveMatchStart } from './support/matches'

test('an incomplete match is cancelled on its own at closing time', async ({ page }) => {
  const club = await clubRow()
  const day = addDays(localDateOf(new Date(), club.timezone), 2)
  const lucas = await createMember({ name: 'Lucas Cierre', prefix: 'cierre-lucas', side: 'drive' })
  const matchId = await createMatchAs(lucas, { day, time: '20:00', side: 'drive' })

  // Simulated clock: the match now starts in an hour, past its closing time; the job runs.
  await moveMatchStart(matchId, 60)
  const closed = await adminClient().rpc('close_matches')
  expect(closed.error).toBeNull()

  await signInWithMagicLink(page, lucas.email, `/partidos/${matchId}`)
  await expect(page.getByText(`Se canceló. ${CANCEL_REASON_TEXT.not_filled}`)).toBeVisible()
  await expect(page.getByText('Cancelado', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Compartir en WhatsApp' })).toHaveCount(0)
})

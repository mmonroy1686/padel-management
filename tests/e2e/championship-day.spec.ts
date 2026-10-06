import { expect, test } from '@playwright/test'
import { addDays, localDateOf } from '../../lib/domain/time'
import { adminClient, clubRow, createMember, signedInClient } from './support/admin'
import { signInWithMagicLink } from './support/auth'
import { fixtureMatches, pairNumbers, publicCode, recordResultAs, registerPairAs, uniquePhone } from './support/championships'

// Next's dev indicator covers the bottom-left tab on mobile (fase 3a notes): navigate with page.goto.
test('campeonato: the organizer draws, schedules and publishes, loads the group, and the public page follows it', async ({ page }) => {
  test.setTimeout(240_000)
  const club = await clubRow()
  // Day 22: past the booking window and apart from the registration flow (day 20).
  const day = addDays(localDateOf(new Date(), club.timezone), 22)
  const admin = await createMember({ name: 'Admin Fixture', prefix: 'fix-admin', role: 'admin' })
  const players = await Promise.all([1, 2, 3, 4].map((n) => createMember({ name: `P${n} Fixture`, prefix: `fix-p${n}` })))
  const pair = (n: number) => `P${n} Fixture y Socio ${n}`
  const courts = await adminClient().from('courts').select('id').eq('club_id', club.id).eq('is_active', true).order('sort_order').limit(2)
  if (courts.error) throw courts.error

  // One category of 4 pairs (each player with a partner from outside), registration closed.
  const staff = await signedInClient(admin)
  const created = await staff.rpc('create_championship', { p_club_id: club.id, p_name: 'Fixture E2E' })
  if (created.error) throw created.error
  const championshipId = created.data.id
  const window = await staff.rpc('add_championship_window', {
    p_championship_id: championshipId,
    p_date: day,
    p_from: '08:00',
    p_to: '20:00',
    p_court_ids: courts.data.map((court) => court.id),
  })
  if (window.error) throw window.error
  const category = await staff.rpc('add_championship_category', {
    p_championship_id: championshipId,
    p_name: '6ta Fixture',
    p_gender: 'open',
    p_min_pairs: 2,
    p_max_pairs: 4,
    p_price: 0,
    p_format: 'groups_knockout',
    p_group_size: 4,
    p_qualifiers: 2,
    p_match_minutes: 90,
    p_seeding: 'ranking',
    p_third_set: 'super_tiebreak',
    p_golden_point: false,
  })
  if (category.error) throw category.error
  const opened = await staff.rpc('open_championship_registration', { p_championship_id: championshipId })
  if (opened.error) throw opened.error
  for (const [index, player] of players.entries()) {
    await registerPairAs(player, category.data.id, { name: `Socio ${index + 1}`, phone: uniquePhone() })
  }
  const closed = await staff.rpc('close_championship_registration', { p_championship_id: championshipId })
  if (closed.error) throw closed.error

  // The organizer draws, schedules and publishes.
  await signInWithMagicLink(page, admin.email, `/club/torneos/campeonatos/${championshipId}`)
  await page.getByRole('button', { name: 'Sortear' }).click()
  await expect(page.getByRole('heading', { name: 'Zona A' })).toBeVisible()
  await page.getByRole('button', { name: 'Programar' }).click()
  await expect(page.getByText('Todos los partidos tienen cancha y horario. Revisalos y publicá el fixture.')).toBeVisible()
  await expect(page.getByRole('table', { name: 'Fixture', exact: true }).getByRole('row')).toHaveCount(8)
  await page.getByRole('button', { name: 'Publicar fixture' }).click()
  await expect(page.getByRole('heading', { name: 'Día del torneo' })).toBeVisible()

  // Five group results through the API (the lower number wins), the last one on the screen.
  const numbers = await pairNumbers(category.data.id)
  const number = (entryId: string | null) => numbers.get(entryId ?? '') ?? 0
  const [last, ...rest] = (await fixtureMatches(championshipId)).filter((match) => match.stage === 'group')
  for (const match of rest) await recordResultAs(admin, match.id, number(match.entryA) < number(match.entryB) ? 'a' : 'b')
  const [winner, loser] = [number(last.entryA), number(last.entryB)].sort((a, b) => a - b).map(pair)
  await page.reload()
  await page
    .getByRole('region', { name: 'Próximos' })
    .getByRole('listitem')
    .filter({ hasText: winner })
    .filter({ hasText: loser })
    .getByRole('button', { name: 'Cargar resultado' })
    .click()
  const sheet = page.getByRole('dialog', { name: 'Cargar resultado' })
  await sheet.getByLabel(`Set 1 · ${winner}`, { exact: true }).fill('6')
  await sheet.getByLabel(`Set 1 · ${loser}`, { exact: true }).fill('2')
  await sheet.getByLabel(`Set 2 · ${winner}`, { exact: true }).fill('6')
  await sheet.getByLabel(`Set 2 · ${loser}`, { exact: true }).fill('3')
  await sheet.getByRole('button', { name: 'Guardar resultado' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'La zona terminó' })).toBeVisible()

  // The 1st and the 2nd of the group are in the final.
  const bracket = page.getByRole('region', { name: 'Llave de 6ta Fixture' })
  await expect(bracket).toContainText(pair(1))
  await expect(bracket).toContainText(pair(2))

  // The public page, without a session.
  const code = await publicCode(championshipId)
  await page.context().clearCookies()
  await page.goto(`/c/${code}`)
  await expect(page.getByRole('heading', { name: 'Fixture E2E', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Zona A' })).toBeVisible()
  const publicBracket = page.getByRole('region', { name: 'Llave de 6ta Fixture' })
  await expect(publicBracket).toContainText(pair(1))
  await expect(publicBracket).toContainText(pair(2))
  await expect(page.getByText(/6-2 6-3|2-6 3-6/).first()).toBeVisible()
})

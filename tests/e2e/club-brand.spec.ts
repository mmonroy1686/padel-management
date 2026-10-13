import { expect, test, type Page } from '@playwright/test'
import { WEEKDAYS_SHORT } from '../../lib/domain/format'
import { addDays, localDateOf, weekdayOf } from '../../lib/domain/time'
import { adminClient, clubRow, createMember, signedInClient } from './support/admin'
import { signInWithMagicLink } from './support/auth'
import { createMatchAs } from './support/matches'

const accentOf = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())

// Changes Rustic's brand for a moment: it goes back to the defaults at the end, pass or fail.
test('marca del club: the admin picks a red, saves, and the grid and the public page of a championship show it', async ({ page }) => {
  test.setTimeout(180_000)
  const club = await clubRow()
  const admin = await createMember({ name: 'Admin Marca', prefix: 'brand-admin', role: 'admin' })

  // A championship with registration open and a public code (set directly: only publishing makes one).
  const staff = await signedInClient(admin)
  const created = await staff.rpc('create_championship', { p_club_id: club.id, p_name: 'Copa Marca E2E' })
  if (created.error) throw created.error
  const code = `marca-${Date.now()}`
  const coded = await adminClient()
    .from('championships')
    .update({ status: 'registration', public_code: code, registration_closes_at: new Date(Date.now() + 7 * 86_400_000).toISOString() })
    .eq('id', created.data.id)
  if (coded.error) throw coded.error

  try {
    await signInWithMagicLink(page, admin.email, '/club/ajustes')
    await expect(page.getByRole('heading', { name: 'Marca del club' })).toBeVisible()
    expect(await accentOf(page)).toBe('#FCB021')

    const primary = page.getByLabel('Color principal', { exact: true })
    await primary.fill('#e11d48')
    await expect(page.getByRole('region', { name: 'Vista previa en modo oscuro' })).toHaveAttribute('style', /--accent: ?#E11D48/)
    await page.getByRole('button', { name: 'Guardar marca' }).click()
    await expect(page.getByRole('status')).toContainText('Marca guardada.')

    await page.goto('/club/grilla')
    expect(await accentOf(page)).toBe('#E11D48')
    await page.goto(`/c/${code}`)
    await expect(page.getByRole('heading', { name: 'Copa Marca E2E' })).toBeVisible()
    expect(await accentOf(page)).toBe('#E11D48')

    const manifest = await (await page.request.get('/manifest.webmanifest')).json()
    expect(manifest).toMatchObject({ name: club.name, theme_color: '#021716' })
    const icon = await page.request.get('/icon')
    expect(icon.ok()).toBe(true)
    expect(icon.headers()['content-type']).toBe('image/png')
  } finally {
    const reset = await adminClient()
      .from('clubs')
      .update({ brand_primary: '#FCB021', brand_background: '#021716', color_mode: 'system' })
      .eq('id', club.id)
    if (reset.error) throw reset.error
  }
})

test('a shared match link shows what is missing and when, even without a session', async ({ request }) => {
  const club = await clubRow()
  const day = addDays(localDateOf(new Date(), club.timezone), 6)
  const player = await createMember({ name: 'Pablo Vista', prefix: 'brand-preview', side: 'drive' })
  const matchId = await createMatchAs(player, { day, time: '20:00', side: 'drive' })

  // WhatsApp has no session: it follows the redirect to the sign-in page and reads its tags.
  const html = await (await request.get(`/partidos/${matchId}`)).text()
  const title = `Faltan 3: 1 de drive y 2 de revés · ${WEEKDAYS_SHORT[weekdayOf(day)]} 20:00`
  expect(html).toContain(`<meta property="og:title" content="${title}"/>`)
  expect(html).toMatch(new RegExp(`<meta property="og:image" content="[^"]*/api/vista-previa/partido/${matchId}"`))
  expect(html).not.toContain('Pablo')

  const image = await request.get(`/api/vista-previa/partido/${matchId}`)
  expect(image.ok()).toBe(true)
  expect(image.headers()['content-type']).toBe('image/png')
})

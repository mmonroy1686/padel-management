import { expect, test } from '@playwright/test'
import { addDays, localDateOf } from '../../lib/domain/time'
import { adminClient, clubRow, createMember, uniqueEmail } from './support/admin'
import { signInWithMagicLink } from './support/auth'
import { bookFirstFreeSlot } from './support/booking'

test('the platform admin creates a club; its admin sets it up with the assistant and a player books there', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000)
  const owner = await createMember({ name: 'Plataforma E2E', prefix: 'plataforma' })
  const granted = await adminClient().from('platform_admins').insert({ user_id: owner.id })
  if (granted.error) throw granted.error
  const slug = `e2e-${Date.now().toString(36)}`
  const adminEmail = uniqueEmail('alta-admin')
  const clubOrigin = `http://${slug}.localhost:3000`

  // A player of Rustic does not see the platform.
  const player = await createMember({ name: 'Jugador Sin Plataforma', prefix: 'sin-plataforma' })
  await signInWithMagicLink(page, player.email, '/')
  expect((await page.goto('/plataforma'))?.status()).toBe(404)

  // The platform admin creates the club.
  await page.context().clearCookies()
  await signInWithMagicLink(page, owner.email, '/plataforma')
  await expect(page.getByRole('heading', { name: 'Plataforma', level: 1 })).toBeVisible()
  // With clubs already there, «Nuevo club» is folded.
  if (!(await page.getByLabel('Nombre del club').isVisible())) await page.getByText('Nuevo club', { exact: true }).click()
  await page.getByLabel('Nombre del club').fill('Club Demo E2E')
  await expect(page.getByLabel('Nombre corto')).toHaveValue('club-demo-e2e')
  await page.getByLabel('Nombre corto').fill(slug)
  await page.getByLabel('Email del admin').fill(adminEmail)
  await page.getByRole('button', { name: 'Crear club' }).click()
  await expect(page.getByRole('status')).toContainText(`Club Demo E2E está en ${clubOrigin}`)
  await page.reload()
  // Its row: a 60-day trial, and setting up courts and prices is the next step. The row opens its page.
  const row = page.getByRole('list', { name: 'Clubes' }).getByRole('listitem').filter({ hasText: 'Club Demo E2E' })
  await expect(row).toContainText('Prueba · quedan 60 días')
  await expect(row).toContainText('Canchas y precios · 0 de 11')
  await row.getByRole('link').click()
  await expect(page.getByRole('heading', { name: 'Club Demo E2E', level: 1 })).toBeVisible()
  await expect(page.getByText(/Invitación pendiente · Sin canchas/)).toBeVisible()
  const clubPage = page.url()

  // Its admin accepts on the club's subdomain and lands in the assistant.
  const context = await browser.newContext()
  const admin = await context.newPage()
  await signInWithMagicLink(admin, adminEmail, '/invitacion', clubOrigin)
  await admin.getByRole('button', { name: 'Aceptar invitación' }).click()
  await expect(admin).toHaveURL(`${clubOrigin}/club/alta/canchas`)
  await expect(admin.getByText('Paso 1 de 6')).toBeVisible()

  // A court, then skip the hours (defaults), a price for every day, and Listo.
  await admin.getByLabel('Nombre de la cancha nueva').fill('Cancha Central')
  await admin.getByRole('button', { name: 'Agregar cancha' }).click()
  await expect(admin.getByText('Cancha Central')).toBeVisible()
  await admin.getByRole('link', { name: 'Siguiente: Horario y turno' }).click()
  await admin.getByRole('link', { name: 'Siguiente: Precios por franja' }).click()
  await expect(admin.getByRole('heading', { name: 'Precios por franja', level: 1 })).toBeVisible()
  const days = admin.getByRole('group', { name: 'Días' }).getByRole('checkbox')
  await expect(days).toHaveCount(7)
  for (const day of await days.all()) await day.check()
  await admin.getByLabel('Desde').selectOption('08:00')
  await admin.getByLabel('Precio en pesos').fill('1000')
  await admin.getByRole('button', { name: 'Agregar precio' }).click()
  await expect(admin.getByText('Precio agregado.')).toBeVisible()
  await admin.goto(`${clubOrigin}/club/alta/recepcion`)
  await expect(admin.getByText('El club ya se puede reservar.')).toBeVisible()
  await admin.getByRole('button', { name: 'Listo, ir al panel' }).click()
  await expect(admin).toHaveURL(`${clubOrigin}/club/inicio`)
  await expect(admin.getByText('Terminá de configurar el club')).toHaveCount(0)
  await context.close()

  // A player of the new club books a court there.
  const club = await clubRow(undefined, slug)
  const member = await createMember({ name: 'Jugadora Club Nuevo', prefix: 'club-nuevo', club: slug })
  const booked = await bookFirstFreeSlot(member, addDays(localDateOf(new Date(), club.timezone), 1), slug)
  expect(booked.courtName).toBe('Cancha Central')

  // The platform shows it ready, with its milestones.
  await page.goto(clubPage)
  await expect(page.getByText(/Listo · 1 cancha · 1 staff · 1 reserva en 7 días/)).toBeVisible()
  await expect(page.getByRole('heading', { name: /^Hitos · \d+ de 11$/ })).toBeVisible()
  await expect(page.getByRole('table')).toBeVisible()

  // The trial: active now, with the owner's contact and a note.
  await page.getByLabel('Estado', { exact: true }).selectOption('active')
  await page.getByRole('button', { name: 'Guardar estado' }).click()
  await expect(page.getByText('Guardado.')).toBeVisible()
  await page.getByLabel('Dueño o encargado').fill('Raúl Dueño')
  await page.getByLabel('Notas', { exact: true }).fill('Quiere arrancar con torneos.')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByText('Guardado.').last()).toBeVisible()
  await page.reload()
  await expect(page.getByText('Activo', { exact: true }).first()).toBeVisible()
  await expect(page.getByLabel('Notas', { exact: true })).toHaveValue('Quiere arrancar con torneos.')

  // Support: in as an admin of the club, and out again.
  await page.getByRole('button', { name: 'Entrar a Club Demo E2E como soporte' }).click()
  await expect(page.getByRole('link', { name: 'Abrir el panel del club' })).toBeVisible()
  await page.getByRole('button', { name: 'Salir de Club Demo E2E' }).click()
  await expect(page.getByRole('button', { name: 'Entrar a Club Demo E2E como soporte' })).toBeVisible()
})

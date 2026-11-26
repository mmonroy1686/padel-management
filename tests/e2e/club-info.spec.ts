import { expect, test } from '@playwright/test'
import { adminClient, clubRow, createMember } from './support/admin'
import { signInWithMagicLink } from './support/auth'
import { RECEIPT_PNG } from './support/files'

// In Pádel Norte, so the club section does not show up at the end of the Inicio other tests read in Rustic.
const NORTE = 'http://norte.localhost:3000'

// The map tiles come from openstreetmap.org: an empty tile each keeps the test off the network.
test.beforeEach(async ({ context }) => {
  await context.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: RECEIPT_PNG }),
  )
})

test.afterAll(async () => {
  const admin = adminClient()
  const club = await clubRow(admin, 'norte')
  const { data: photos } = await admin.from('club_photos').select('path').eq('club_id', club.id)
  if (photos?.length) await admin.storage.from('club-logos').remove(photos.map((photo) => photo.path))
  await admin.from('club_photos').delete().eq('club_id', club.id)
  const { error } = await admin
    .from('clubs')
    .update({ address: null, latitude: null, longitude: null, google_maps_url: null, phone: null, instagram: null, contact_email: null, amenities: [] })
    .eq('id', club.id)
  if (error) throw error
})

test('the admin loads the club info and a player sees it at the end of Inicio', async ({ page, browser }) => {
  const owner = await createMember({ name: 'Admin Datos E2E', prefix: 'datos-admin', role: 'admin', club: 'norte' })
  const player = await createMember({ name: 'Lía Datos E2E', prefix: 'datos-jugadora', club: 'norte' })

  // Ajustes → Datos del club: address, a pin tapped on the map, WhatsApp and a service.
  await signInWithMagicLink(page, owner.email, '/club/ajustes/datos', NORTE)
  await page.getByLabel('WhatsApp').fill('092 369 558')
  await page.getByLabel('Dirección').fill('Av. Italia 1234')
  const map = page.getByRole('region', { name: 'Mapa para marcar el club' })
  await expect(map.locator('.leaflet-container')).toBeVisible()
  await map.click()
  await expect(page.getByRole('button', { name: 'Quitar ubicación' })).toBeVisible()
  await page.getByLabel('Bar').check()
  await page.getByRole('button', { name: 'Guardar datos' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Datos guardados' })).toBeVisible()

  // A photo: the browser shrinks it and uploads it.
  await page.getByLabel('Subir fotos (entran 8 más)').setInputFiles({ name: 'club.png', mimeType: 'image/png', buffer: RECEIPT_PNG })
  await page.getByRole('button', { name: 'Subir fotos', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Foto agregada.' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Foto de portada' })).toBeVisible()

  const club = await clubRow(adminClient(), 'norte')
  const { data: saved, error } = await adminClient().from('clubs').select('phone, address, latitude, longitude, amenities').eq('id', club.id).single()
  if (error) throw error
  expect(saved).toMatchObject({ phone: '092369558', address: 'Av. Italia 1234', amenities: ['bar'] })
  expect(saved.latitude).not.toBeNull()

  // The player, on her own phone: «El club» at the end of Inicio, folded into one line she opens.
  const playerContext = await browser.newContext()
  await playerContext.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: RECEIPT_PNG }),
  )
  const playerPage = await playerContext.newPage()
  await signInWithMagicLink(playerPage, player.email, '/', NORTE)
  const section = playerPage.locator('details').filter({ hasText: 'Contacto, cómo llegar, horarios y servicios' })
  await section.locator('summary').click()
  await expect(section.getByRole('img', { name: 'Foto 1 de Pádel Norte' })).toBeVisible()
  await expect(section.getByRole('region', { name: 'Mapa de Pádel Norte' }).locator('.leaflet-container')).toBeVisible()
  await expect(section.getByRole('link', { name: 'WhatsApp: 092 369 558' })).toHaveAttribute('href', /^https:\/\/wa\.me\/59892369558\?text=/)
  await expect(section.getByRole('list', { name: 'Servicios' })).toHaveText('Bar')
  await expect(section.getByRole('link', { name: 'Cómo llegar' })).toHaveAttribute('href', /google\.com\/maps\/search\/\?api=1&query=/)
  await playerContext.close()
})

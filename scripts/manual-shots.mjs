// Screenshots for the user manual (docs/manual): players on a phone, staff on a laptop, against `npm run dev:local`
// with the demo data (`npm run demo:data`). Usage:
//   node scripts/manual-shots.mjs            every shot
//   node scripts/manual-shots.mjs j07        only the shots whose name starts with j07
// Then republish docs/manual/index.html as the manual's artifact.
import { createClient } from '@supabase/supabase-js'
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import { localSupabase } from './local-supabase.mjs'

const OUT = 'docs/manual/img'
const ONLY = process.argv[2] ?? ''
const MAILPIT = 'http://127.0.0.1:54324'
const BASE = 'http://localhost:3000'
const PLAYER = 'mariana@demo.rustic.test'
const RECEPTION = 'reception@demo.rustic.test'
const ADMIN = 'admin@demo.rustic.test'
fs.mkdirSync(OUT, { recursive: true })

// The records the shots open, found in the local demo data.
const env = localSupabase()
const db = createClient(env.apiUrl, env.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
async function userId(email) {
  const { data } = await db.auth.admin.listUsers({ perPage: 1000 })
  return data.users.find((user) => user.email === email)?.id ?? null
}
async function first(query) {
  const { data } = await query.limit(1).maybeSingle()
  return data?.id ?? null
}
const now = new Date().toISOString()
const playerId = await userId(PLAYER)
const ID = {
  booking: await first(db.from('bookings').select('id').eq('player_id', playerId).is('match_id', null).eq('status', 'confirmed').gt('starts_at', now).order('starts_at')),
  match: await first(db.from('open_matches').select('id').eq('status', 'forming').gt('starts_at', now).order('starts_at', { ascending: false })),
  live: await first(db.from('tournaments').select('id').eq('status', 'in_progress')),
  americano: await first(db.from('tournaments').select('id').eq('status', 'registration').order('starts_at', { ascending: false })),
  championship: await first(db.from('championships').select('id').eq('status', 'registration')),
}
const { data: published } = await db.from('championships').select('public_code').not('public_code', 'is', null).limit(1).maybeSingle()
const publicCode = published?.public_code ?? null

async function code(email) {
  for (let i = 0; i < 60; i++) {
    const search = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json()
    if (search.messages[0]) {
      const message = await (await fetch(`${MAILPIT}/api/v1/message/${search.messages[0].ID}`)).json()
      const found = /id="sign-in-code"[^>]*>\s*(\d{6})/.exec(message.HTML)
      if (found) return found[1]
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`No llegó el código de ${email}`)
}

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const DESK = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 }

async function signIn(browser, email, options) {
  const context = await browser.newContext(options)
  const page = await context.newPage()
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' })
  await page.goto(`${BASE}/auth/ingreso`)
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Mandarme un código' }).click()
  await page.getByLabel('Código del mail').fill(await code(email))
  await page.waitForURL((url) => !url.pathname.startsWith('/auth'))
  return { context, page }
}

async function shot(page, path, name, options = {}) {
  if (ONLY && !name.startsWith(ONLY)) return
  if (path.includes('null')) return console.log('SIN DATOS', name)
  try {
    await page.goto(`${BASE}${path}`)
    await page.waitForLoadState('networkidle')
    // The Next dev indicator.
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' })
    await page.waitForTimeout(700)
    if (options.scrollTo) {
      await page.getByText(options.scrollTo, { exact: true }).first()
        .evaluate((element) => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 70))
      await page.waitForTimeout(500)
    }
    if (options.before) await options.before(page)
    const ext = options.png ? 'png' : 'jpg'
    await page.screenshot({ path: `${OUT}/${name}.${ext}`, fullPage: options.full ?? false, ...(options.png ? {} : { type: 'jpeg', quality: 74 }) })
    console.log('ok', name)
  } catch (error) {
    console.log('FALLÓ', name, String(error).split('\n')[0])
  }
}

const bottom = (page) => page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).then(() => page.waitForTimeout(500))
const browser = await chromium.launch()

{
  const context = await browser.newContext(PHONE)
  const page = await context.newPage()
  await shot(page, '/auth/ingreso', 'j01-ingreso')
  if (publicCode) await shot(page, `/c/${publicCode}`, 'a16-cuadro-publico', { full: true, png: true })
  await context.close()
}

{
  const { context, page } = await signIn(browser, PLAYER, PHONE)
  await shot(page, '/', 'j02-inicio')
  await shot(page, '/', 'j03-menu-cuenta', { before: (p) => p.getByRole('button', { name: 'Tu cuenta' }).click().then(() => p.waitForTimeout(350)) })
  await shot(page, '/reservar', 'j04-reservar')
  await shot(page, '/reservar', 'j05-hoja-reserva', {
    before: (p) => p.getByRole('button', { name: /por persona/ }).first().click().then(() => p.waitForTimeout(600)),
  })
  await shot(page, '/', 'j06-ultimos-partidos', { scrollTo: 'Tus últimos partidos' })
  await shot(page, '/', 'j06b-inicio-abajo', { before: bottom })
  await shot(page, `/turno/${ID.booking}`, 'j07-turno')
  await shot(page, '/partidos', 'j08-partidos')
  await shot(page, `/partidos/${ID.match}`, 'j09-partido')
  await shot(page, '/torneos', 'j10-torneos')
  await shot(page, `/torneos/${ID.americano}`, 'j11-americano')
  await shot(page, `/torneos/${ID.live}`, 'j12-americano-en-juego')
  await shot(page, `/campeonatos/${ID.championship}`, 'j13-campeonato')
  await shot(page, '/day-use', 'j14-day-use')
  await shot(page, '/avisos', 'j15-avisos')
  await shot(page, '/perfil', 'j16-perfil')
  await shot(page, '/perfil', 'j16b-perfil-abajo', { before: bottom })
  await shot(page, '/perfil/partidos', 'j17-historial')
  await context.close()
}

{
  const { context, page } = await signIn(browser, RECEPTION, DESK)
  await shot(page, '/club/inicio', 'c01-inicio-recepcion', { full: true })
  await shot(page, '/club/grilla', 'c02-grilla')
  await shot(page, '/club/grilla', 'c03-grilla-detalle', {
    before: (p) => p.getByRole('button', { name: /^Cancha \d, .*: / }).first().click().then(() => p.waitForTimeout(600)),
  })
  await shot(page, '/club/cobros', 'c04-cobros', { full: true })
  await shot(page, '/club/calendario', 'c05-calendario')
  await shot(page, '/club/jugadores', 'c06-jugadores')
  await shot(page, '/club/day-use', 'c07-day-use', { full: true })
  await context.close()
}

{
  const { context, page } = await signIn(browser, ADMIN, DESK)
  await shot(page, '/club/asistente', 'a02-asistente', { full: true })
  await shot(page, '/club/torneos', 'a03-torneos', { full: true })
  await shot(page, `/club/torneos/${ID.live}`, 'a04-americano-admin', { full: true })
  await shot(page, `/club/torneos/campeonatos/${ID.championship}`, 'a05-campeonato-admin', { full: true })
  await shot(page, '/club/ajustes', 'a06-ajustes', { full: true })
  await shot(page, '/club/ajustes/reservas', 'a08-ajustes-reservas', { full: true })
  await shot(page, '/club/ajustes/pagos', 'a10-ajustes-pagos', { full: true })
  if (publicCode) await shot(page, `/c/${publicCode}/tv`, 'a15-tv', { png: true })
  else console.log('SIN DATOS a15-tv, a16-cuadro-publico: hace falta un campeonato publicado')
  await context.close()
}
await browser.close()

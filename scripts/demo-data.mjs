// Demo data to show the app to Rustic: players, bookings and payments from the first day of this
// month to the end of the next one, recurring slots, a block, open matches, americanos (open, in
// play, finished, next month), waits on the waitlist and day use with stamps, all relative to today. Every row hangs from accounts @demo.rustic.test, so each run first removes the previous
// demo and `--clean` removes it for good. Real members and their data are never touched.
//
//   npm run demo:data                      local Supabase (supabase start)
//   npm run demo:data -- --clean           remove the demo, local
//   npm run demo:data -- --player=<email>  also give an existing account a demo history
//   npm run demo:data -- --prod            production: needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//                                          and SUPABASE_PUBLISHABLE_KEY in the environment
// Locally the demo fills the courts the e2e flows book: run --clean before npm run test:e2e.
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { localSupabase } from './local-supabase.mjs'

const DEMO_DOMAIN = 'demo.rustic.test'
const args = process.argv.slice(2)
const PROD = args.includes('--prod')
const CLEAN_ONLY = args.includes('--clean')
const FEATURED_EMAIL = args.find((arg) => arg.startsWith('--player='))?.slice('--player='.length) ?? null

const env = PROD
  ? {
      apiUrl: required('SUPABASE_URL'),
      serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
      publishableKey: required('SUPABASE_PUBLISHABLE_KEY'),
    }
  : localSupabase()
const OPTIONS = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(env.apiUrl, env.serviceRoleKey, OPTIONS)
// Only the script signs in as the demo accounts; their password is new on every run and never shown.
const PASSWORD = randomBytes(18).toString('base64url')

const STAFF = [
  { key: 'admin', name: 'Sofía Méndez', role: 'admin', gender: 'female', side: 'both', hand: 'right', category: 4 },
  { key: 'reception', name: 'Lucía Pereira', role: 'reception', gender: 'female', side: 'drive', hand: 'right', category: 6 },
]
// [key, name, gender, side, hand, category]
const PLAYERS = [
  ['martin', 'Martín Suárez', 'male', 'drive', 'right', 4],
  ['nicolas', 'Nicolás Rodríguez', 'male', 'backhand', 'right', 4],
  ['santiago', 'Santiago Fernández', 'male', 'both', 'left', 5],
  ['diego', 'Diego Castro', 'male', 'drive', 'right', 5],
  ['federico', 'Federico Silva', 'male', 'backhand', 'right', 5],
  ['joaquin', 'Joaquín Pérez', 'male', 'both', 'right', 6],
  ['gonzalo', 'Gonzalo Núñez', 'male', 'drive', 'right', 6],
  ['matias', 'Matías Sosa', 'male', 'backhand', 'left', 6],
  ['agustin', 'Agustín Correa', 'male', 'both', 'right', 7],
  ['bruno', 'Bruno Olivera', 'male', 'drive', 'right', 3],
  ['valentina', 'Valentina López', 'female', 'drive', 'right', 5],
  ['camila', 'Camila Martínez', 'female', 'backhand', 'right', 5],
  ['florencia', 'Florencia Díaz', 'female', 'both', 'right', 6],
  ['carolina', 'Carolina Acosta', 'female', 'drive', 'left', 6],
  ['mariana', 'Mariana Gómez', 'female', 'backhand', 'right', 4],
  ['lucia', 'Lucía Benítez', 'female', 'both', 'right', 7],
  ['paula', 'Paula Ramírez', 'female', 'drive', 'right', 5],
  ['sofia', 'Sofía Cabrera', 'female', 'backhand', 'right', 6],
  ['andrea', 'Andrea Morales', 'female', 'both', 'left', 4],
  ['jimena', 'Jimena Torres', 'female', 'drive', 'right', 7],
].map(([key, name, gender, side, hand, category]) => ({ key, name, gender, side, hand, category, role: 'player' }))

// A tiny PNG, the receipt of every demo transfer.
const RECEIPT = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

const { data: club, error: clubError } = await admin.from('clubs').select('*').eq('slug', 'rustic').single()
if (clubError) fail('No está el club "rustic". Local: npm run db:reset.')
console.log(`${PROD ? 'PRODUCCIÓN' : 'Local'}: ${env.apiUrl}, club ${club.name}`)

const demoIds = await demoUserIds()
if (demoIds.length > 0) {
  await clean(demoIds)
  console.log(`Quitamos la demo anterior (${demoIds.length} cuentas).`)
}
if (CLEAN_ONLY) process.exit(0)

const { data: courts } = await admin
  .from('courts')
  .select('id, name')
  .eq('club_id', club.id)
  .eq('is_active', true)
  .order('sort_order')
if (!courts || courts.length < 2) fail('La demo necesita al menos 2 canchas activas.')
const { count: priceCount } = await admin.from('pricing_rules').select('id', { count: 'exact', head: true }).eq('club_id', club.id)
if (!priceCount) fail('La demo necesita precios cargados (Ajustes → Precios).')

// ---------- people ----------
const people = {}
for (const person of [...STAFF, ...PLAYERS]) people[person.key] = await createMember(person)
let featured = null
if (FEATURED_EMAIL) {
  featured = await existingMember(FEATURED_EMAIL)
  if (featured) people.featured = featured
}
const reception = people.reception.client
const clubAdmin = people.admin.client
const staffId = people.reception.id
console.log(`Cuentas: ${Object.keys(people).length} (${STAFF.length} del club, ${PLAYERS.length} jugadores).`)

await check(
  admin
    .from('clubs')
    .update({ loyalty_enabled: true, loyalty_every: 5, loyalty_discount_percent: 100, loyalty_expiry_months: 6 })
    .eq('id', club.id),
)

// ---------- time ----------
const TZ = club.timezone
const today = localDate(new Date())
const now = new Date()
const SLOTS = slotTimes()
// Times in this script are examples ('18:30'); each club has its own grid, so they snap to its nearest slot.
const near = (time) => {
  const minutes = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))
  return SLOTS.reduce((best, slot) => (Math.abs(minutes(slot) - minutes(time)) < Math.abs(minutes(best) - minutes(time)) ? slot : best))
}
const at = (days, time) => zoned(addDays(today, days), near(time))
const futureSlot = (days, time) => at(days, time) > new Date(now.getTime() + 30 * 60_000)
const court = (index) => courts[index % courts.length]
// This month and the next: from the 1st of this month to the last day of the next one.
const monthStart = -(Number(today.slice(8, 10)) - 1)
const horizon = (() => {
  const [year, month] = today.split('-').map(Number)
  const lastOfNext = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10)
  return Math.round((Date.parse(lastOfNext) - Date.parse(today)) / 86_400_000)
})()

// Things that take whole courts go first: day use, tournaments, recurring slots and the block.
// ---------- day use ----------
const products = {}
for (const [key, product] of Object.entries({
  full: {
    p_name: 'Day use completo',
    p_price: 450,
    p_includes: ['Vestuarios y duchas', 'Pileta', 'Cancha libre'],
    p_weekdays: [0, 6],
    p_from_time: '08:00',
    p_to_time: '12:30',
    p_capacity: 30,
    p_court_ids: [court(2).id],
    p_sort_order: 1,
  },
  padel: {
    p_name: 'Day use pádel',
    p_price: 300,
    p_includes: ['Vestuarios y duchas', 'Cancha libre en horario valle'],
    p_weekdays: [1, 2, 3, 4, 5],
    p_from_time: '14:00',
    p_to_time: '17:00',
    p_capacity: 20,
    p_court_ids: [court(2).id],
    p_sort_order: 2,
  },
})) {
  const { data, error } = await clubAdmin.rpc('save_day_use_product', { p_club_id: club.id, ...product })
  if (error) fail(`save_day_use_product: ${error.message}`)
  products[key] = { id: data[0].saved_id, ...product }
}

// ---------- tournaments ----------
const tournaments = []
// The first of a few evenings where both courts are free (real bookings may already be there).
let openTournament = null
for (const [days, time] of [[5, '18:30'], [6, '18:30'], [4, '18:30'], [5, '14:00'], [6, '14:00']]) {
  openTournament = await tryRpc(reception, 'create_tournament', {
    p_name: 'Americano de 5ta y 6ta',
    p_starts_at: at(days, time).toISOString(),
    p_court_ids: [court(0).id, court(1).id],
    p_max_players: 8,
    p_points_per_game: 24,
    p_round_minutes: 20,
    p_rounds: 7,
    p_category_min: 5,
    p_category_max: 6,
    p_type: 'mixed',
    p_price: 400,
  }, { quiet: true })
  if (openTournament) break
}
if (openTournament) {
  tournaments.push('Americano de 5ta y 6ta (inscripción abierta)')
  for (const key of ['santiago', 'diego', 'valentina', 'camila', 'florencia', 'joaquin']) {
    await tryRpc(people[key].client, 'join_tournament', { p_tournament_id: openTournament.id })
  }
  if (featured) await tryRpc(featured.client, 'join_tournament', { p_tournament_id: openTournament.id })
  await payEntries(openTournament.id, { cash: ['santiago', 'valentina'], transfer: ['camila'] })
}
// Next month: a bigger one, just opened. The first Saturday afternoon from three weeks ahead.
let nextMonthTournament = null
for (let days = 21; days <= horizon && !nextMonthTournament; days++) {
  if (weekday(addDays(today, days)) !== 6) continue
  nextMonthTournament = await tryRpc(reception, 'create_tournament', {
    p_name: 'Americano de primavera',
    p_starts_at: at(days, '14:00').toISOString(),
    p_court_ids: courts.slice(0, Math.min(courts.length, 3)).map((item) => item.id),
    p_max_players: courts.length >= 3 ? 12 : 8,
    p_points_per_game: 24,
    p_round_minutes: 20,
    p_rounds: 7,
    p_category_min: 3,
    p_category_max: 7,
    p_type: 'mixed',
    p_price: 500,
  }, { quiet: true })
}
if (nextMonthTournament) {
  tournaments.push('Americano de primavera (el mes que viene)')
  for (const key of ['nicolas', 'federico', 'mariana', 'paula']) {
    await tryRpc(people[key].client, 'join_tournament', { p_tournament_id: nextMonthTournament.id })
  }
}

// Today if it still fits before closing, otherwise tomorrow; started with some results.
const playDay = futureSlot(0, '17:00') ? 0 : 1
const liveTournament = await tryRpc(reception, 'create_tournament', {
  p_name: 'Americano mixto de la casa',
  p_starts_at: at(playDay, '17:00').toISOString(),
  p_court_ids: [court(0).id, court(1).id],
  p_max_players: 8,
  p_points_per_game: 24,
  p_round_minutes: 20,
  p_rounds: 7,
  p_category_min: 3,
  p_category_max: 7,
  p_type: 'mixed',
  p_price: 400,
})
if (liveTournament) {
  tournaments.push('Americano mixto de la casa (en juego)')
  for (const key of ['martin', 'nicolas', 'mariana', 'andrea', 'paula', 'federico']) {
    await tryRpc(people[key].client, 'join_tournament', { p_tournament_id: liveTournament.id })
  }
  await tryRpc(reception, 'add_tournament_guest', { p_tournament_id: liveTournament.id, p_name: 'Pablo' })
  await tryRpc(reception, 'add_tournament_guest', { p_tournament_id: liveTournament.id, p_name: 'Rocío' })
  await payEntries(liveTournament.id, { cash: ['martin', 'nicolas', 'mariana', 'andrea', 'paula'] })
  await tryRpc(reception, 'close_tournament_registration', { p_tournament_id: liveTournament.id })
  await tryRpc(reception, 'start_tournament', { p_tournament_id: liveTournament.id })
  const { data: games } = await admin
    .from('tournament_games')
    .select('id, round')
    .eq('tournament_id', liveTournament.id)
    .lte('round', 3)
  for (const [index, game] of (games ?? []).entries()) {
    await tryRpc(reception, 'record_tournament_score', { p_game_id: game.id, p_score_a: [15, 9, 13, 11, 17, 7][index % 6] })
  }
}
if (await finishedTournament()) tournaments.push('Relámpago de la semana pasada (finalizado)')

// ---------- championships ----------
// Two December weekends, past the bookings: the "Copa de Verano" taking sign-ups (pairs with a place, a full
// category with a waiting line, payments of every kind, a withdrawal) and the "Torneo Aniversario" with
// registration closed and one category short of pairs (to merge or cancel).
const championshipLines = []
const decemberSaturdays = (() => {
  const year = Number(today.slice(0, 4)) + (today.slice(5, 7) === '12' ? 1 : 0)
  const out = []
  for (let day = 1; day <= 31 && out.length < 3; day++) {
    const date = `${year}-12-${String(day).padStart(2, '0')}`
    if (weekday(date) === 6) out.push(date)
  }
  return out
})()
const dayEnd = club.closes_at.slice(0, 5) === '00:00' ? '24:00' : club.closes_at.slice(0, 5)
const outside = (name, phone, level) => ({ name, phone, level })

async function makeChampionship({ name, rules, saturday, categories, pairs, cash = [], transfer = [], withdraw = [], close = false }) {
  const championship = await tryRpc(clubAdmin, 'create_championship', { p_club_id: club.id, p_name: name, p_rules: rules, p_max_categories: 2 })
  if (!championship) return null
  const courtIds = courts.map((item) => item.id)
  await tryRpc(clubAdmin, 'add_championship_window', {
    p_championship_id: championship.id, p_date: saturday, p_from: near('14:00'), p_to: dayEnd, p_court_ids: courtIds,
  })
  await tryRpc(clubAdmin, 'add_championship_window', {
    p_championship_id: championship.id, p_date: addDays(saturday, 1), p_from: SLOTS[0],
    p_to: SLOTS[SLOTS.indexOf(near('20:00')) + 1] ?? dayEnd, p_court_ids: courtIds,
  })
  const categoryIds = []
  for (const category of categories) {
    const created = await tryRpc(clubAdmin, 'add_championship_category', {
      p_championship_id: championship.id,
      p_name: category.name,
      p_gender: category.gender,
      p_min_pairs: category.min ?? 4,
      p_max_pairs: category.max,
      p_price: category.price,
      p_format: category.format ?? 'groups_knockout',
      p_group_size: category.groupSize ?? 4,
      p_qualifiers: 2,
      p_match_minutes: category.minutes ?? 90,
      p_seeding: 'ranking',
      p_third_set: category.thirdSet ?? 'super_tiebreak',
      p_golden_point: category.goldenPoint ?? false,
      ...(category.levels ? { p_level_min: category.levels[0], p_level_max: category.levels[1] } : {}),
      ...(category.timeLimit ? { p_time_limit: category.timeLimit } : {}),
    })
    categoryIds.push(created?.id ?? null)
  }
  if (!(await tryRpc(clubAdmin, 'open_championship_registration', { p_championship_id: championship.id }))) return null

  // A pair: [category, who signs up (a member key, or 'desk' for reception), partner (a member key, someone
  // from outside, or for the desk both players from outside)].
  const entries = {}
  for (const [index, [categoryIndex, first, second]] of pairs.entries()) {
    const categoryId = categoryIds[categoryIndex]
    if (!categoryId) continue
    const partner = typeof second === 'string' ? people[second] : null
    const entry =
      first === 'desk'
        ? await tryRpc(reception, 'add_championship_pair', {
            p_category_id: categoryId, p_player1_level: second[0].level, p_player2_level: second[1].level,
            p_player1_name: second[0].name, p_player1_phone: second[0].phone,
            p_player2_name: second[1].name, p_player2_phone: second[1].phone,
            p_note: index % 2 === 0 ? 'Se anotaron por teléfono' : null,
          }, { quiet: true })
        : await tryRpc(people[first].client, 'register_championship_pair', {
            p_category_id: categoryId,
            p_my_level: people[first].category,
            p_partner_level: partner ? partner.category : second.level,
            ...(partner ? { p_partner_profile_id: partner.id } : { p_partner_name: second.name, p_partner_phone: second.phone }),
          }, { quiet: true })
    if (entry) entries[first === 'desk' ? `desk${index}` : first] = { ...entry, price: categories[categoryIndex].price }
  }
  for (const key of cash) {
    if (entries[key]) await tryRpc(reception, 'record_championship_cash', { p_entry_id: entries[key].id, p_amount: entries[key].price }, { quiet: true })
  }
  for (const key of transfer) {
    if (entries[key]) await reportTransfer(people[key], 'report_championship_transfer', { p_entry_id: entries[key].id }, entries[key].id)
  }
  for (const key of withdraw) {
    if (entries[key]) await tryRpc(people[key].client, 'withdraw_championship_entry', { p_entry_id: entries[key].id }, { quiet: true })
  }
  if (close) await tryRpc(clubAdmin, 'close_championship_registration', { p_championship_id: championship.id })
  return { id: championship.id, pairs: Object.keys(entries).length, categoryIds }
}

if (decemberSaturdays.length >= 2) {
  const summer = await makeChampionship({
    name: 'Copa de Verano',
    rules: 'Zonas de 4 parejas y llave. Partidos al mejor de 3 sets con súper tie-break; en 6ta Damas, 50 minutos de juego. Tolerancia de 15 minutos.',
    saturday: decemberSaturdays[1],
    categories: [
      { name: '6ta Libre', gender: 'open', max: 8, price: 2400 },
      { name: '5ta Caballeros', gender: 'men', max: 4, price: 2400, levels: [3, 5] },
      { name: '6ta Damas', gender: 'women', max: 6, price: 2000, format: 'round_robin', minutes: 60, timeLimit: 50, goldenPoint: true },
      { name: 'Mixto B', gender: 'mixed', max: 6, price: 2200 },
    ],
    pairs: [
      [0, 'joaquin', 'gonzalo'],
      [0, 'matias', outside('Pedro Viera', '099 111 201', 6)],
      [0, 'agustin', outside('Leandro Ríos', '099 111 202', 6)],
      [0, 'desk', [outside('Hernán Pais', '099 111 203', 6), outside('Ignacio Bas', '099 111 204', 7)]],
      [1, 'santiago', 'diego'],
      [1, 'federico', 'martin'],
      [1, 'nicolas', outside('Rodrigo Laens', '099 111 205', 4)],
      [1, 'bruno', outside('Emilio Varela', '099 111 206', 5)],
      [1, 'desk', [outside('Álvaro Cid', '099 111 207', 5), outside('Tomás Ugarte', '099 111 208', 5)]],
      [1, 'gonzalo', outside('Raúl Mena', '099 111 215', 5)],
      [1, 'desk', [outside('Ciro Lima', '099 111 216', 4), outside('Mateo Font', '099 111 217', 5)]],
      [2, 'florencia', 'carolina'],
      [2, 'sofia', 'lucia'],
      [2, 'jimena', outside('Natalia Pose', '099 111 209', 7)],
      [3, 'valentina', 'diego'],
      [3, 'camila', 'joaquin'],
      [3, 'paula', outside('Germán Silva', '099 111 210', 5)],
    ],
    cash: ['joaquin', 'santiago', 'florencia', 'valentina'],
    transfer: ['matias', 'federico', 'sofia'],
    withdraw: ['nicolas'],
  })
  if (summer) {
    championshipLines.push(`Copa de Verano (inscripción abierta, ${summer.pairs} parejas)`)
    // The featured account plays the 6ta Libre with Mariana.
    if (featured && summer.categoryIds[0]) {
      await tryRpc(featured.client, 'register_championship_pair', {
        p_category_id: summer.categoryIds[0], p_my_level: 5, p_partner_level: people.mariana.category, p_partner_profile_id: people.mariana.id,
      }, { quiet: true })
    }
  }
  const anniversary = await makeChampionship({
    name: 'Torneo Aniversario',
    rules: 'Eliminación directa en 5ta y 6ta; Mixto todos contra todos. Al mejor de 3 sets, sin límite de tiempo.',
    saturday: decemberSaturdays[0],
    categories: [
      { name: '5ta', gender: 'open', max: 8, price: 2600, format: 'knockout' },
      { name: '6ta', gender: 'open', max: 8, price: 2600, format: 'knockout' },
      { name: 'Mixto', gender: 'mixed', max: 6, price: 2400, format: 'round_robin', groupSize: 3 },
    ],
    pairs: [
      [0, 'martin', 'nicolas'],
      [0, 'santiago', 'federico'],
      [0, 'mariana', 'andrea'],
      [0, 'diego', outside('Pablo Rocca', '099 111 211', 5)],
      [1, 'gonzalo', 'matias'],
      [1, 'carolina', 'sofia'],
      [1, 'agustin', outside('Martín Cabral', '099 111 212', 6)],
      [1, 'desk', [outside('Sergio Gil', '099 111 213', 6), outside('Luis Arce', '099 111 214', 6)]],
      [2, 'paula', 'bruno'],
    ],
    cash: ['martin', 'santiago', 'gonzalo', 'carolina'],
    transfer: ['mariana'],
    close: true,
  })
  if (anniversary) championshipLines.push(`Torneo Aniversario (inscripción cerrada, ${anniversary.pairs} parejas; Mixto con pocas parejas)`)
}

// ---------- recurring slots and a block ----------
let series = 0
for (const [days, time, courtIndex, holder] of [
  [1, '20:00', 0, { p_guest_name: 'Los de siempre' }],
  [2, '18:30', 1, { p_player_id: people.gonzalo.id }],
  [3, '21:30', 0, { p_guest_name: 'Escuela de pádel' }],
  [4, '20:00', 1, { p_player_id: people.mariana.id }],
  [5, '17:00', 2, { p_guest_name: 'Empresa Andes' }],
]) {
  const date = addDays(today, days)
  const created = await tryRpc(reception, 'create_series', {
    p_court_id: court(courtIndex).id,
    p_weekday: weekday(date),
    p_start_time: near(time),
    p_starts_on: date,
    ...holder,
  })
  if (created) series++
}
await tryRpc(reception, 'block_court', {
  p_court_id: court(courts.length - 1).id,
  p_starts_at: at(1, '09:30').toISOString(),
  p_ends_at: at(1, '12:30').toISOString(),
  p_note: 'Clase de menores',
})

// ---------- open matches ----------
let matches = 0
for (const [days, time, courtIndex, creator, joiners] of [
  [0, '21:30', 1, 'diego', ['camila', 'valentina']],
  [1, '21:30', 0, 'bruno', ['gonzalo']],
  [2, '20:00', 1, 'florencia', ['carolina', 'sofia']],
  [3, '18:30', 0, 'santiago', []],
  [4, '20:00', 1, 'agustin', ['lucia', 'jimena', 'joaquin']],
  [6, '21:30', 2, 'nicolas', ['federico']],
  [8, '20:00', 0, 'paula', ['sofia', 'andrea']],
  [10, '18:30', 1, 'matias', []],
  [12, '21:30', 0, 'camila', ['valentina', 'florencia']],
]) {
  // A match stops taking players match_close_hours before it starts.
  if (at(days, time) <= new Date(now.getTime() + (club.match_close_hours * 60 + 30) * 60_000)) continue
  const creatorPerson = people[creator]
  const match = await tryRpc(creatorPerson.client, 'create_match', {
    p_court_id: court(courtIndex).id,
    p_starts_at: at(days, time).toISOString(),
    p_allow_other_court: true,
    p_category_min: Math.max(1, creatorPerson.category - 1),
    p_category_max: Math.min(8, creatorPerson.category + 2),
    p_match_type: 'mixed',
    p_side: creatorPerson.side === 'both' ? 'drive' : creatorPerson.side,
  })
  if (!match) continue
  matches++
  for (const key of joiners) await joinAnywhere(people[key].client, match.id)
  if (featured && days === 2) await joinAnywhere(featured.client, match.id)
}

// ---------- bookings ----------
const bookingPlan = []
const holders = ['nicolas', 'federico', 'gonzalo', 'matias', 'bruno', 'mariana', 'paula', 'sofia', 'andrea', 'carolina']
let turn = 0
for (let days = 0; days <= horizon; days++) {
  const evening = SLOTS.filter((time) => time >= '17:00')
  const daytime = SLOTS.filter((time) => time < '17:00')
  const weekend = [0, 6].includes(weekday(addDays(today, days)))
  // The first week is busy; further ahead, about half the evenings and some weekend mornings.
  const times = days <= 6
    ? [...evening, ...daytime.filter((_, index) => (index + days) % 3 === 0)]
    : [...evening, ...daytime.filter((_, index) => weekend && (index + days) % 2 === 0)]
  for (const time of times) {
    for (let index = 0; index < courts.length; index++) {
      if ((days + index + time.length + turn) % 4 === 3) continue // leave some free
      if (days > 6 && (days + index + turn) % 2 === 0) { turn++; continue }
      turn++
      if (!futureSlot(days, time)) continue
      const guest = turn % 5 === 0
      bookingPlan.push({ days, time, courtId: courts[index].id, holder: guest ? null : holders[turn % holders.length], guest })
    }
  }
}
const GUESTS = ['Rodríguez', 'Familia García', 'Méndez y amigos', 'Barrios', 'Clínica Pádel Kids']
let booked = 0
const bookedCells = []
let paidCash = 0
let transfers = 0
for (const [index, plan] of bookingPlan.entries()) {
  const holderId = plan.holder ? people[plan.holder].id : null
  const booking = await tryRpc(reception, 'staff_book', {
    p_court_id: plan.courtId,
    p_starts_at: at(plan.days, plan.time).toISOString(),
    ...(holderId ? { p_player_id: holderId } : { p_guest_name: GUESTS[index % GUESTS.length] }),
  }, { quiet: true })
  if (!booking) continue
  booked++
  bookedCells.push(plan)
  if (index % 3 === 0) {
    if (await tryRpc(reception, 'record_cash', { p_booking_id: booking.id, p_amount: booking.price })) paidCash++
  } else if (index % 3 === 1 && plan.holder && plan.days <= 6) {
    if (await reportTransfer(people[plan.holder], 'report_transfer', { p_booking_id: booking.id }, booking.id)) transfers++
  }
}
if (featured) {
  for (const [days, time, courtIndex] of [[1, '20:00', 2], [4, '18:30', 2]]) {
    await tryRpc(reception, 'staff_book', {
      p_court_id: court(courtIndex).id,
      p_starts_at: at(days, time).toISOString(),
      p_player_id: featured.id,
    }, { quiet: true })
  }
}
const pastUnpaid = await pastBookings()
const played = await monthPlayed()

// ---------- waitlist ----------
// Players waiting for a taken evening slot in the next days: that court, that time.
let waits = 0
const waiters = ['lucia', 'joaquin', 'jimena', 'valentina', 'diego', 'florencia']
const waitCells = bookedCells.filter((cell) => cell.days >= 1 && cell.days <= 4 && cell.time >= '18:30')
for (const [index, key] of waiters.entries()) {
  const cell = waitCells[(index * 5) % Math.max(waitCells.length, 1)]
  if (!cell) break
  const end = SLOTS[SLOTS.indexOf(cell.time) + 1] ?? club.closes_at.slice(0, 5)
  const waited = await tryRpc(people[key].client, 'create_slot_wait', {
    p_club_id: club.id,
    p_date: addDays(today, cell.days),
    p_from: cell.time,
    p_to: end,
    p_court_ids: [cell.courtId],
  }, { quiet: true })
  if (waited) waits++
}
// The featured account is real: the clean step never removes its waits, so add one only if it has none.
const featuredWaits = featured
  ? await admin.from('slot_waits').select('id', { count: 'exact', head: true }).eq('player_id', featured.id).eq('status', 'waiting')
  : null
if (featured && waitCells.length > 0 && (featuredWaits?.count ?? 0) === 0) {
  const cell = waitCells[waitCells.length - 1]
  const end = SLOTS[SLOTS.indexOf(cell.time) + 1] ?? club.closes_at.slice(0, 5)
  const waited = await tryRpc(featured.client, 'create_slot_wait', {
    p_club_id: club.id,
    p_date: addDays(today, cell.days),
    p_from: cell.time,
    p_to: end,
    p_court_ids: [cell.courtId],
  }, { quiet: true })
  if (waited) waits++
}

// ---------- day use passes and stamps ----------
const passes = await dayUsePasses()

console.log(`
Listo. Demo cargada:
  ${booked} reservas de hoy a fin del mes que viene (${paidCash} cobradas en efectivo, ${transfers} transferencias para confirmar)
  ${played} turnos jugados este mes, ${pastUnpaid} sin pagar, ${series} turnos fijos, 1 bloqueo ("Clase de menores")
  ${waits} esperas en la lista de espera
  ${matches} partidos abiertos
  ${tournaments.length} torneos: ${tournaments.join('; ')}
  ${championshipLines.length} campeonatos: ${championshipLines.join('; ') || 'ninguno'}
  2 pases de day use, ${passes} pases vendidos y sellos de ejemplo (Valentina tiene una recompensa)
${featured ? `  ${FEATURED_EMAIL} tiene reservas, un partido, una inscripción y 4 de 5 sellos.\n` : ''}
Mostralo con tu cuenta de admin (Panel del club) o sumá tu cuenta de jugador con --player=<email>.
Para sacarlo: npm run demo:data -- --clean${PROD ? ' --prod' : ''}`)

// ======================================================================================

function required(name) {
  const value = process.env[name]
  if (!value) fail(`Falta ${name} en el entorno.`)
  return value
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

async function check(query) {
  const { error } = await query
  if (error) fail(error.message)
}

async function tryRpc(client, name, params, { quiet = false } = {}) {
  const { data, error } = await client.rpc(name, params)
  if (error) {
    if (!quiet) console.warn(`  (se saltea ${name}: ${error.message})`)
    return null
  }
  return data
}

async function demoUserIds() {
  const ids = []
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) fail(error.message)
    ids.push(...data.users.filter((user) => user.email?.endsWith(`@${DEMO_DOMAIN}`)).map((user) => user.id))
    if (data.users.length < 1000) break
  }
  return ids
}

async function signedIn(email) {
  const client = createClient(env.apiUrl, env.publishableKey, OPTIONS)
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) fail(`No pudimos ingresar como ${email}: ${error.message}`)
  return client
}

async function createMember(person) {
  const email = `${person.key}@${DEMO_DOMAIN}`
  const created = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: person.name },
  })
  if (created.error) fail(`${email}: ${created.error.message}`)
  const id = created.data.user.id
  await check(
    admin
      .from('profiles')
      .update({ display_name: person.name, side: person.side, hand: person.hand, gender: person.gender, is_public: true })
      .eq('id', id),
  )
  await check(
    admin.from('club_members').upsert({
      club_id: club.id,
      user_id: id,
      role: person.role,
      category: person.category,
      category_validated: true,
    }),
  )
  return { ...person, id, email, client: await signedIn(email) }
}

// An account that already exists (e.g. Miguel's). The script only adds demo rows around it.
async function existingMember(email) {
  let user = null
  for (let page = 1; !user; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) fail(error.message)
    user = data.users.find((candidate) => candidate.email === email) ?? null
    if (data.users.length < 1000) break
  }
  if (!user) {
    console.warn(`  (no existe ${email}: la demo sigue sin su historia)`)
    return null
  }
  const { data: member } = await admin
    .from('club_members')
    .select('category')
    .eq('club_id', club.id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member) {
    console.warn(`  (${email} todavía no completó su perfil en el club: la demo sigue sin su historia)`)
    return null
  }
  // A magic link for the script's own session: the password of a real account is never touched.
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (link.error) fail(link.error.message)
  const client = createClient(env.apiUrl, env.publishableKey, OPTIONS)
  const verified = await client.auth.verifyOtp({ type: 'magiclink', token_hash: link.data.properties.hashed_token })
  if (verified.error) fail(`No pudimos preparar ${email}: ${verified.error.message}`)
  return { key: 'featured', id: user.id, email, category: member.category, client }
}

async function reportTransfer(person, rpc, params, name) {
  const path = `${person.id}/${name}-${Date.now()}.png`
  const upload = await person.client.storage.from('receipts').upload(path, RECEIPT, { contentType: 'image/png' })
  if (upload.error) return null
  return tryRpc(person.client, rpc, { ...params, p_receipt_path: path })
}

async function payEntries(tournamentId, { cash = [], transfer = [] }) {
  const { data: entries } = await admin
    .from('tournament_entries')
    .select('id, player_id')
    .eq('tournament_id', tournamentId)
    .is('removed_at', null)
  const entryOf = (key) => entries?.find((entry) => entry.player_id === people[key].id)
  for (const key of cash) {
    const entry = entryOf(key)
    if (entry) await tryRpc(reception, 'record_tournament_cash', { p_entry_id: entry.id, p_amount: 400 })
  }
  for (const key of transfer) {
    const entry = entryOf(key)
    if (entry) await reportTransfer(people[key], 'report_tournament_transfer', { p_entry_id: entry.id }, entry.id)
  }
}

// Slots already played: today's earlier ones (so the grid of the day looks like a normal day,
// mostly paid) and a few of the last two days still owed. Inserted directly: the booking functions
// never take a slot in the past.
async function pastBookings() {
  let count = 0
  const todayPlayed = SLOTS.filter((time) => !futureSlot(0, time) && at(0, time) < now)
    .flatMap((time, row) => courts.map((_, courtIndex) => [0, time, courtIndex, holders[(row + courtIndex) % holders.length]]))
    .filter((_, index) => index % 4 !== 3)
  for (const [days, time, courtIndex, key] of [
    ...todayPlayed,
    [-1, '20:00', 0, 'federico'],
    [-1, '21:30', 1, 'matias'],
    [-2, '18:30', 0, 'bruno'],
  ]) {
    const startsAt = at(days, time)
    const period = `[${startsAt.toISOString()},${new Date(startsAt.getTime() + club.slot_minutes * 60_000).toISOString()})`
    const occupancy = await admin
      .from('court_occupancy')
      .insert({ club_id: club.id, court_id: court(courtIndex).id, kind: 'booking', period, created_by: staffId })
      .select('id')
      .single()
    if (occupancy.error) continue
    const price = time >= '18:30' ? 1600 : 1200
    const booking = await admin
      .from('bookings')
      .insert({
        club_id: club.id,
        court_id: court(courtIndex).id,
        period,
        player_id: people[key].id,
        source: 'reception',
        price,
        occupancy_id: occupancy.data.id,
        created_by: staffId,
      })
      .select('id')
      .single()
    if (booking.error) continue
    // Today's played slots were mostly paid at the desk; the older ones stay owed for Cobros.
    if (days === 0 && (courtIndex + Number(time.slice(0, 2))) % 4 !== 0) {
      await admin.from('payments').insert({
        club_id: club.id,
        booking_id: booking.data.id,
        method: 'cash',
        amount: price,
        status: 'confirmed',
        reported_by: staffId,
        confirmed_by: staffId,
        confirmed_at: at(0, time).toISOString(),
      })
    } else count++
  }
  return count
}

// Played earlier this month (before yesterday): evenings on every court, mostly paid at the desk or by
// transfer, inserted directly because the RPCs only book ahead.
async function monthPlayed() {
  let count = 0
  for (let days = monthStart; days <= -3; days++) {
    for (const time of SLOTS.filter((slot) => slot >= '17:00')) {
      for (let courtIndex = 0; courtIndex < courts.length; courtIndex++) {
        if ((days + courtIndex + Number(time.slice(0, 2))) % 3 === 0) continue
        const startsAt = at(days, time)
        const period = `[${startsAt.toISOString()},${new Date(startsAt.getTime() + club.slot_minutes * 60_000).toISOString()})`
        const occupancy = await admin
          .from('court_occupancy')
          .insert({ club_id: club.id, court_id: court(courtIndex).id, kind: 'booking', period, created_by: staffId })
          .select('id')
          .single()
        if (occupancy.error) continue
        const price = time >= '18:30' ? 1600 : 1200
        const booking = await admin
          .from('bookings')
          .insert({
            club_id: club.id,
            court_id: court(courtIndex).id,
            period,
            player_id: people[holders[(count + courtIndex) % holders.length]].id,
            source: count % 3 === 0 ? 'online' : 'reception',
            price,
            occupancy_id: occupancy.data.id,
            created_by: staffId,
          })
          .select('id')
          .single()
        if (booking.error) continue
        count++
        if (count % 7 === 0) continue // a few still owed
        await admin.from('payments').insert({
          club_id: club.id,
          booking_id: booking.data.id,
          method: count % 4 === 0 ? 'transfer' : 'cash',
          amount: price,
          status: 'confirmed',
          reported_by: staffId,
          confirmed_by: staffId,
          confirmed_at: startsAt.toISOString(),
        })
      }
    }
  }
  return count
}

// Last week's americano, finished: inserted directly with its fixture and every result.
async function finishedTournament() {
  const startsAt = at(-6, '18:00')
  const minutes = 7 * 20
  const period = `[${startsAt.toISOString()},${new Date(startsAt.getTime() + minutes * 60_000).toISOString()})`
  const tournament = await admin
    .from('tournaments')
    .insert({
      club_id: club.id,
      name: 'Relámpago de la semana pasada',
      period,
      court_ids: [court(0).id, court(1).id],
      max_players: 8,
      rounds: 7,
      category_min: 4,
      category_max: 7,
      match_type: 'mixed',
      price: 400,
      status: 'finished',
      created_by: staffId,
    })
    .select('id')
    .single()
  if (tournament.error) {
    console.warn(`  (se saltea el torneo finalizado: ${tournament.error.message})`)
    return false
  }
  const keys = ['martin', 'nicolas', 'santiago', 'diego', 'valentina', 'camila', 'mariana', 'andrea']
  const entries = await admin
    .from('tournament_entries')
    .insert(keys.map((key) => ({ club_id: club.id, tournament_id: tournament.data.id, player_id: people[key].id, created_by: staffId })))
    .select('id')
  if (entries.error) return false
  const ids = entries.data.map((entry) => entry.id)
  const games = []
  const n = ids.length
  for (let round = 0; round < n - 1; round++) {
    // Circle method, as in start_tournament.
    const pairs = [ids[round], ids[n - 1]]
    for (let k = 1; k < n / 2; k++) pairs.push(ids[(round + k) % (n - 1)], ids[(round - k + n - 1) % (n - 1)])
    for (let game = 0; game < n / 4; game++) {
      games.push({
        club_id: club.id,
        tournament_id: tournament.data.id,
        round: round + 1,
        wave: 1,
        court_id: court(game).id,
        starts_at: new Date(startsAt.getTime() + round * 20 * 60_000).toISOString(),
        a1_entry_id: pairs[4 * game],
        a2_entry_id: pairs[4 * game + 1],
        b1_entry_id: pairs[4 * game + 2],
        b2_entry_id: pairs[4 * game + 3],
        score_a: [16, 10, 13, 8, 19, 12, 14][(round + game * 3) % 7],
        recorded_by: staffId,
        recorded_at: new Date(startsAt.getTime() + (round + 1) * 20 * 60_000).toISOString(),
      })
    }
  }
  const inserted = await admin.from('tournament_games').insert(games)
  return !inserted.error
}

async function dayUsePasses() {
  let count = 0
  let stampCode = 0
  // Stamps: past check-ins, inserted directly (check-in only works on the day of the pass).
  const history = [
    ['valentina', [3, 10, 17, 24, 31]],
    ['camila', [7, 14]],
    ['florencia', [5, 12, 19]],
  ]
  if (featured) history.push(['featured', [6, 13, 20, 27]])
  for (const [key, daysAgo] of history) {
    const rows = daysAgo.map((ago) => ({
      club_id: club.id,
      product_id: products.full.id,
      on_date: addDays(today, -ago),
      player_id: people[key].id,
      price: 450,
      code: `DU-9${String(stampCode++).padStart(5, '0')}`,
      status: 'inside',
      source: 'reception',
      checked_in_at: at(-ago, '09:00').toISOString(),
      checked_in_by: staffId,
      created_by: staffId,
    }))
    const { error } = await admin.from('day_use_passes').insert(rows)
    if (error) console.warn(`  (se saltean sellos de ${key}: ${error.message})`)
  }

  // The next day with day use from today: passes sold, some already inside.
  for (let days = 0; days <= 6; days++) {
    const date = addDays(today, days)
    const product = [products.full, products.padel].find((candidate) => candidate.p_weekdays.includes(weekday(date)))
    if (!product || !futureOrToday(days, product.p_to_time)) continue
    const buyers = ['camila', 'florencia', 'diego', 'joaquin', 'carolina', 'agustin']
    for (const [index, key] of buyers.entries()) {
      const pass = await tryRpc(reception, 'sell_day_use', { p_product_id: product.id, p_date: date, p_player_id: people[key].id }, { quiet: true })
      if (!pass) continue
      count++
      if (index % 2 === 0) await tryRpc(reception, 'record_day_use_cash', { p_pass_id: pass.id, p_amount: product.p_price })
      if (days === 0 && index < 4) await tryRpc(reception, 'check_in_day_use', { p_pass_id: pass.id })
    }
    const guest = await tryRpc(reception, 'sell_day_use', { p_product_id: product.id, p_date: date, p_guest_name: 'Visitante de Punta' }, { quiet: true })
    if (guest) count++
    if (featured) {
      const mine = await tryRpc(reception, 'sell_day_use', { p_product_id: product.id, p_date: date, p_player_id: featured.id }, { quiet: true })
      if (mine) count++
    }
    break
  }
  return count
}

async function joinAnywhere(client, matchId) {
  for (const position of [2, 3, 4]) {
    const { error } = await client.rpc('join_match', { p_match_id: matchId, p_position: position })
    if (!error) return true
    if (!['spot_taken', 'side_mismatch'].includes(error.message)) return false
  }
  return false
}

async function clean(ids) {
  const idList = `(${ids.join(',')})`
  const series = await admin.from('recurring_series').select('id').in('created_by', ids)
  const seriesIds = (series.data ?? []).map((row) => row.id)
  const [spots, created] = await Promise.all([
    admin.from('match_slots').select('match_id').in('player_id', ids),
    admin.from('open_matches').select('id').in('created_by', ids),
  ])
  const matchIds = [...new Set([...(spots.data ?? []).map((row) => row.match_id), ...(created.data ?? []).map((row) => row.id)])]
  const filters = [`player_id.in.${idList}`, `created_by.in.${idList}`]
  if (seriesIds.length > 0) filters.push(`series_id.in.(${seriesIds.join(',')})`)
  if (matchIds.length > 0) filters.push(`match_id.in.(${matchIds.join(',')})`)
  const bookings = await admin.from('bookings').select('id, occupancy_id').or(filters.join(','))
  if (bookings.error) fail(bookings.error.message)
  const occupancyIds = bookings.data.flatMap((row) => (row.occupancy_id ? [row.occupancy_id] : []))
  // By id in batches: hundreds of ids do not fit in one request URL.
  for (const batch of chunks(bookings.data.map((row) => row.id))) await check(admin.from('bookings').delete().in('id', batch))
  if (seriesIds.length > 0) await check(admin.from('recurring_series').delete().in('id', seriesIds))
  if (matchIds.length > 0) await check(admin.from('open_matches').delete().in('id', matchIds))
  await check(admin.from('tournaments').delete().in('created_by', ids))
  await check(admin.from('championship_entries').delete().in('created_by', ids))
  await check(admin.from('championships').delete().in('created_by', ids))
  await check(admin.from('players').delete().or(`created_by.in.${idList},profile_id.in.${idList}`))
  await check(admin.from('tournament_entries').delete().in('player_id', ids))
  await check(admin.from('day_use_passes').delete().or(`player_id.in.${idList},created_by.in.${idList}`))
  await check(admin.from('day_use_products').delete().in('created_by', ids))
  await check(admin.from('court_occupancy').delete().in('created_by', ids))
  for (const batch of chunks(occupancyIds)) await check(admin.from('court_occupancy').delete().in('id', batch))
  for (const id of ids) {
    const files = await admin.storage.from('receipts').list(id)
    if (files.data && files.data.length > 0) {
      await admin.storage.from('receipts').remove(files.data.map((file) => `${id}/${file.name}`))
    }
    const deleted = await admin.auth.admin.deleteUser(id)
    if (deleted.error) fail(deleted.error.message)
  }
}

function chunks(list, size = 100) {
  const out = []
  for (let index = 0; index < list.length; index += size) out.push(list.slice(index, index + size))
  return out
}

// ---------- dates on the club's clock ----------

function localDate(instant) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ ?? club.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant)
}

function addDays(date, days) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

function weekday(date) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

// The instant of a wall-clock time on the club's clock.
function zoned(date, time) {
  const guess = new Date(`${date}T${time}:00Z`)
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: club.timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(guess)
      .map((part) => [part.type, part.value]),
  )
  const shown = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute)
  return new Date(guess.getTime() - (shown - guess.getTime()))
}

function slotTimes() {
  const toMinutes = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))
  const times = []
  for (let start = toMinutes(club.opens_at); start + club.slot_minutes <= toMinutes(club.closes_at); start += club.slot_minutes) {
    times.push(`${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`)
  }
  return times
}

function futureOrToday(days, endTime) {
  return days > 0 || zoned(today, endTime.slice(0, 5)) > now
}

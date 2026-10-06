import {
  CATEGORY_FORMATS,
  CATEGORY_GENDERS,
  normalizePhone,
  SEEDINGS,
  THIRD_SETS,
  type CategoryFormat,
  type CategoryGender,
  type Seeding,
  type ThirdSet,
} from './championships'
import { isUuid, readBoolean, readEnum, readInt, readLocalDate, readText, readTime, readUuid } from './input'
import type { ParseResult } from './settings'
import { parseTime, zonedTime, type LocalDate } from './time'

// Server Actions read every championship form here, with the same limits as the database functions and a
// Spanish message for each.

export type ChampionshipInput = { name: string; rules: string; maxCategories: number; closesAt: string | null }
export type WindowInput = { championshipId: string; date: LocalDate; fromTime: string; toTime: string; courtIds: string[] }
export type CategoryInput = {
  championshipId: string
  name: string
  gender: CategoryGender
  levelMin: number | null
  levelMax: number | null
  minPairs: number
  maxPairs: number
  price: number
  format: CategoryFormat
  groupSize: number
  qualifiers: number
  matchMinutes: number
  seeding: Seeding
  thirdSet: ThirdSet
  goldenPoint: boolean
  // Minutes a match lasts at most; null: best of 3 sets, as long as it takes.
  timeLimit: number | null
}
export type PairPlayerInput =
  | { kind: 'member'; profileId: string; level: number }
  | { kind: 'guest'; name: string; phone: string; level: number }
export type RegisterInput = { categoryId: string; myLevel: number; partner: PairPlayerInput }
export type PairInput = { categoryId: string; player1: PairPlayerInput; player2: PairPlayerInput; note: string | null }
export type UnavailabilityInput = { entryId: string; blocks: string[]; note: string | null }

const PLAYER_KINDS = ['member', 'guest'] as const
const BLOCK_KEY = /^[0-9]{4}-[0-9]{2}-[0-9]{2}@[0-9]{2}:[0-9]{2}$/

function fail(message: string): { ok: false; message: string } {
  return { ok: false, message }
}

// An optional text: empty is null; longer than allowed is undefined (an error for the caller).
function optionalText(form: FormData, name: string, maxLength: number): string | null | undefined {
  const value = form.get(name)
  if (typeof value !== 'string' || value.trim() === '') return null
  const text = value.trim()
  return text.length <= maxLength ? text : undefined
}

export function parseChampionshipForm(form: FormData, timezone: string): ParseResult<ChampionshipInput> {
  const name = readText(form, 'name', { maxLength: 80 })
  if (!name) return fail('Poné un nombre de hasta 80 letras.')
  const rules = optionalText(form, 'rules', 5000)
  if (rules === undefined) return fail('El reglamento tiene hasta 5000 letras.')
  const maxCategories = readInt(form, 'maxCategories', { min: 1, max: 5 })
  if (maxCategories === null) return fail('Cada jugador puede anotarse en 1 a 5 categorías.')

  let closesAt: string | null = null
  if (optionalText(form, 'closesDate', 10) !== null || optionalText(form, 'closesTime', 5) !== null) {
    const date = readLocalDate(form, 'closesDate')
    const time = readTime(form, 'closesTime')
    if (!date || !time) return fail('Completá el día y la hora del cierre, o dejalos vacíos.')
    closesAt = zonedTime(date, parseTime(time), timezone).toISOString()
  }
  return { ok: true, value: { name, rules: rules ?? '', maxCategories, closesAt } }
}

export function parseWindowForm(form: FormData): ParseResult<WindowInput> {
  const championshipId = readUuid(form, 'championshipId')
  if (!championshipId) return fail('Recargá la página y probá de nuevo.')
  const date = readLocalDate(form, 'date')
  const fromTime = readTime(form, 'fromTime')
  const toTime = readTime(form, 'toTime')
  if (!date || !fromTime || !toTime) return fail('Elegí el día y las horas.')
  if (parseTime(fromTime) >= parseTime(toTime)) return fail('"Hasta" tiene que ser después de "Desde".')
  const rawCourts = form.getAll('courtIds')
  const courtIds = [...new Set(rawCourts.filter(isUuid).map((id) => id.toLowerCase()))]
  if (courtIds.length === 0 || courtIds.length !== rawCourts.length || courtIds.length > 20) return fail('Elegí las canchas.')
  return { ok: true, value: { championshipId, date, fromTime, toTime, courtIds } }
}

export function parseCategoryForm(form: FormData): ParseResult<CategoryInput> {
  const championshipId = readUuid(form, 'championshipId')
  if (!championshipId) return fail('Recargá la página y probá de nuevo.')
  const name = readText(form, 'name', { maxLength: 40 })
  if (!name) return fail('Poné un nombre de hasta 40 letras.')
  const gender = readEnum(form, 'gender', CATEGORY_GENDERS)
  if (!gender) return fail('Elegí el género.')

  const levelsGiven = optionalText(form, 'levelMin', 2) !== null || optionalText(form, 'levelMax', 2) !== null
  const levelMin = levelsGiven ? readInt(form, 'levelMin', { min: 1, max: 8 }) : null
  const levelMax = levelsGiven ? readInt(form, 'levelMax', { min: 1, max: 8 }) : null
  if (levelsGiven && (levelMin === null || levelMax === null || levelMin > levelMax)) {
    return fail('La categoría "desde" tiene que ser menor o igual que "hasta", o dejá las dos vacías.')
  }

  const maxPairs = readInt(form, 'maxPairs', { min: 2, max: 64 })
  if (maxPairs === null) return fail('El máximo de parejas va de 2 a 64.')
  const minPairs = readInt(form, 'minPairs', { min: 2, max: maxPairs })
  if (minPairs === null) return fail('El mínimo de parejas va de 2 a 64 y no pasa el máximo.')
  const price = readInt(form, 'price', { min: 0, max: 10_000_000 })
  if (price === null) return fail('Ingresá el precio por pareja, sin puntos.')
  const format = readEnum(form, 'format', CATEGORY_FORMATS)
  if (!format) return fail('Elegí el formato.')
  const groupSize = readInt(form, 'groupSize', { min: 3, max: 4 })
  if (groupSize === null) return fail('Las zonas son de 3 o 4 parejas.')
  const qualifiers = readInt(form, 'qualifiers', { min: 1, max: groupSize - 1 })
  if (qualifiers === null) return fail(`En zonas de ${groupSize} clasifican ${groupSize === 3 ? '1 o 2' : 'de 1 a 3'}.`)
  const matchMinutes = readInt(form, 'matchMinutes', { min: 30, max: 240 })
  if (matchMinutes === null) return fail('La duración de un partido va de 30 a 240 minutos.')
  const seeding = readEnum(form, 'seeding', SEEDINGS)
  if (!seeding) return fail('Elegí cómo se ordenan los cabezas de serie.')
  const thirdSet = readEnum(form, 'thirdSet', THIRD_SETS)
  if (!thirdSet) return fail('Elegí cómo se juega el tercer set.')
  const timed = form.get('timeLimitMode') === 'timed'
  const timeLimit = timed ? readInt(form, 'timeLimit', { min: 20, max: matchMinutes }) : null
  if (timed && timeLimit === null) return fail('El límite de tiempo va de 20 minutos a los minutos por partido.')

  return {
    ok: true,
    value: {
      championshipId,
      name,
      gender,
      levelMin,
      levelMax,
      minPairs,
      maxPairs,
      price,
      format,
      groupSize,
      qualifiers,
      matchMinutes,
      seeding,
      thirdSet,
      goldenPoint: readBoolean(form, 'goldenPoint'),
      timeLimit,
    },
  }
}

// One player of a pair. The fields start with the prefix (partnerKind, player1Name...); `who` names him in the
// messages ("tu compañero", "el jugador 1").
export function parsePairPlayer(form: FormData, prefix: string, who: string): ParseResult<PairPlayerInput> {
  const kind = readEnum(form, `${prefix}Kind`, PLAYER_KINDS)
  if (!kind) return fail(`Elegí si ${who} es socio o de afuera.`)
  const level = readInt(form, `${prefix}Level`, { min: 1, max: 8 })
  if (level === null) return fail(`Elegí la categoría de ${who}.`)
  if (kind === 'member') {
    const profileId = readUuid(form, `${prefix}ProfileId`)
    if (!profileId) return fail(`Elegí a ${who} de la lista de socios.`)
    return { ok: true, value: { kind, profileId, level } }
  }
  const name = readText(form, `${prefix}Name`, { maxLength: 60 })
  if (!name) return fail(`Poné el nombre de ${who}.`)
  const phone = normalizePhone(readText(form, `${prefix}Phone`, { maxLength: 30 }) ?? '')
  if (!phone) return fail('Revisá el teléfono: tiene que tener entre 8 y 15 números.')
  return { ok: true, value: { kind, name, phone, level } }
}

export function parseRegisterForm(form: FormData): ParseResult<RegisterInput> {
  const categoryId = readUuid(form, 'categoryId')
  if (!categoryId) return fail('Elegí la categoría.')
  const myLevel = readInt(form, 'myLevel', { min: 1, max: 8 })
  if (myLevel === null) return fail('Elegí tu categoría.')
  const partner = parsePairPlayer(form, 'partner', 'tu compañero')
  if (!partner.ok) return partner
  return { ok: true, value: { categoryId, myLevel, partner: partner.value } }
}

export function parsePairForm(form: FormData): ParseResult<PairInput> {
  const categoryId = readUuid(form, 'categoryId')
  if (!categoryId) return fail('Elegí la categoría.')
  const player1 = parsePairPlayer(form, 'player1', 'el jugador 1')
  if (!player1.ok) return player1
  const player2 = parsePairPlayer(form, 'player2', 'el jugador 2')
  if (!player2.ok) return player2
  const note = optionalText(form, 'note', 300)
  if (note === undefined) return fail('La nota tiene hasta 300 letras.')
  return { ok: true, value: { categoryId, player1: player1.value, player2: player2.value, note } }
}

export function parseUnavailabilityForm(form: FormData): ParseResult<UnavailabilityInput> {
  const entryId = readUuid(form, 'entryId')
  if (!entryId) return fail('Recargá la página y probá de nuevo.')
  const raw = form.getAll('blocks')
  if (raw.length > 200 || raw.some((value) => typeof value !== 'string' || !BLOCK_KEY.test(value))) {
    return fail('Revisá los horarios marcados.')
  }
  const blocks = [...new Set(raw as string[])]
  const note = optionalText(form, 'note', 300)
  if (note === undefined) return fail('La nota tiene hasta 300 letras.')
  return { ok: true, value: { entryId, blocks, note } }
}

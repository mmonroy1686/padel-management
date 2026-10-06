import type { Score } from './championship-results'
import { isUuid, readUuid } from './input'
import type { ParseResult } from './settings'

// The fixture forms, read before any RPC (Server Actions are reachable by any POST).

const INVALID = 'Revisá los datos ingresados.'

function fail<T>(message: string): ParseResult<T> {
  return { ok: false, message }
}

function text(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

// "seed:<entry id>" = 1, 2...; empty for none. The pairs come back strongest first.
export function readSeedsForm(form: FormData): ParseResult<{ categoryId: string; entryIds: string[] }> {
  const categoryId = readUuid(form, 'categoryId')
  if (!categoryId) return fail(INVALID)
  const seeds: { entryId: string; seed: number }[] = []
  for (const [key, value] of form.entries()) {
    if (!key.startsWith('seed:') || typeof value !== 'string' || value.trim() === '') continue
    const entryId = key.slice('seed:'.length)
    const seed = Number(value)
    if (!isUuid(entryId) || !Number.isInteger(seed) || seed < 1 || seed > 64) return fail(INVALID)
    seeds.push({ entryId: entryId.toLowerCase(), seed })
  }
  if (new Set(seeds.map((item) => item.seed)).size !== seeds.length) {
    return fail('Dos parejas tienen el mismo número de cabeza de serie.')
  }
  return { ok: true, value: { categoryId, entryIds: seeds.sort((a, b) => a.seed - b.seed).map((item) => item.entryId) } }
}

// a1/b1, a2/b2, a3/b3: the games of each side per set; the sets left empty go at the end.
export function readResultForm(form: FormData): ParseResult<{ matchId: string; sets: Score[] }> {
  const matchId = readUuid(form, 'matchId')
  if (!matchId) return fail(INVALID)
  const sets: Score[] = []
  let ended = false
  for (const number of [1, 2, 3]) {
    const a = text(form, `a${number}`)
    const b = text(form, `b${number}`)
    if (a === '' && b === '') {
      ended = true
      continue
    }
    if (ended) return fail(`Cargá el set ${number - 1} antes que el ${number}.`)
    if (a === '' || b === '') return fail(`Completá los dos números del set ${number}.`)
    if (!/^[0-9]{1,2}$/.test(a) || !/^[0-9]{1,2}$/.test(b)) return fail('Los games son números de 0 a 99.')
    sets.push([Number(a), Number(b)])
  }
  if (sets.length === 0) return fail('Cargá al menos un set.')
  return { ok: true, value: { matchId, sets } }
}

// "slot" = "<court id>|<start as ISO>", one option of the move sheet.
export function readSlotForm(form: FormData): ParseResult<{ matchId: string; courtId: string; startsAt: string }> {
  const matchId = readUuid(form, 'matchId')
  const [courtId, startsAt] = text(form, 'slot').split('|')
  const time = startsAt ? Date.parse(startsAt) : Number.NaN
  if (!matchId || !isUuid(courtId) || Number.isNaN(time)) return fail('Elegí una cancha y un horario.')
  return { ok: true, value: { matchId, courtId: courtId.toLowerCase(), startsAt: new Date(time).toISOString() } }
}

// "place:<entry id>" = 1, 2...: one place per pair, from the 1st on.
export function readGroupOrderForm(form: FormData): ParseResult<{ groupId: string; entryIds: string[] }> {
  const groupId = readUuid(form, 'groupId')
  if (!groupId) return fail(INVALID)
  const places: { entryId: string; place: number }[] = []
  for (const [key, value] of form.entries()) {
    if (!key.startsWith('place:') || typeof value !== 'string') continue
    const entryId = key.slice('place:'.length)
    const place = Number(value)
    if (!isUuid(entryId) || !Number.isInteger(place) || place < 1) return fail(INVALID)
    places.push({ entryId: entryId.toLowerCase(), place })
  }
  const sorted = places.sort((a, b) => a.place - b.place)
  if (sorted.length < 2 || sorted.some((item, index) => item.place !== index + 1)) {
    return fail('Cada pareja va en un puesto distinto, del 1 en adelante.')
  }
  return { ok: true, value: { groupId, entryIds: sorted.map((item) => item.entryId) } }
}

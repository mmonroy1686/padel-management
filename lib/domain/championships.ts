import { dayLongLabel, formatPrice, timeIn } from './format'
import { formatMinutes, localDateOf, parseTime, zonedTime, type LocalDate } from './time'
import type { EntryPayment } from './tournaments'
import { shortTime } from './waitlist'

// Championships by pairs: categories that share days and courts. This file is what the screens need to know
// about them; the rules live in the database (supabase/migrations/20261006*), mirrored here for the screens.

export const CHAMPIONSHIP_STATUSES = [
  'draft', 'registration', 'closed', 'drawn', 'published', 'in_progress', 'finished', 'cancelled',
] as const
export type ChampionshipStatus = (typeof CHAMPIONSHIP_STATUSES)[number]
export const CATEGORY_GENDERS = ['open', 'men', 'women', 'mixed'] as const
export type CategoryGender = (typeof CATEGORY_GENDERS)[number]
export const CATEGORY_FORMATS = ['groups_knockout', 'knockout', 'round_robin'] as const
export type CategoryFormat = (typeof CATEGORY_FORMATS)[number]
export const SEEDINGS = ['ranking', 'manual'] as const
export type Seeding = (typeof SEEDINGS)[number]
export const THIRD_SETS = ['super_tiebreak', 'full'] as const
export type ThirdSet = (typeof THIRD_SETS)[number]
export type CategoryStatus = 'open' | 'cancelled' | 'merged'
export type EntryStatus = 'active' | 'waiting' | 'withdrawn' | 'removed'

export const CHAMPIONSHIP_STATUS_LABELS: Record<ChampionshipStatus, string> = {
  draft: 'Borrador',
  registration: 'Inscripción abierta',
  closed: 'Inscripción cerrada',
  drawn: 'Sorteado',
  published: 'Programado',
  in_progress: 'En juego',
  finished: 'Finalizado',
  cancelled: 'Cancelado',
}
export const GENDER_LABELS: Record<CategoryGender, string> = { open: 'Libre', men: 'Caballeros', women: 'Damas', mixed: 'Mixto' }
export const FORMAT_LABELS: Record<CategoryFormat, string> = {
  groups_knockout: 'Zonas y llave',
  knockout: 'Llave directa',
  round_robin: 'Todos contra todos',
}
export const SEEDING_LABELS: Record<Seeding, string> = { ranking: 'Por ranking', manual: 'A mano' }
export const THIRD_SET_LABELS: Record<ThirdSet, string> = { super_tiebreak: 'Súper tie-break a 10', full: 'Set completo' }
export const ENTRY_STATUS_LABELS: Record<EntryStatus, string> = {
  active: 'Con lugar',
  waiting: 'En espera',
  withdrawn: 'Se dio de baja',
  removed: 'Quitada',
}

// What "Agregar categoría" proposes (design; Rustic's real prices are still to come).
export const CATEGORY_DEFAULTS = {
  gender: 'open',
  minPairs: 4,
  maxPairs: 16,
  price: 2000,
  format: 'groups_knockout',
  groupSize: 4,
  qualifiers: 2,
  matchMinutes: 90,
  seeding: 'ranking',
  thirdSet: 'super_tiebreak',
  goldenPoint: false,
  timeLimit: null,
} as const
export const MAX_CATEGORIES_DEFAULT = 2
// The blocks of the "horarios imposibles", like private.championship_blocks.
export const BLOCK_MINUTES = 120

export type ChampionshipWindow = { id: string; date: LocalDate; fromTime: string; toTime: string; courtIds: string[] }
export type ChampionshipPlayer = { id: string; name: string; profileId: string | null }
export type ChampionshipEntry = {
  id: string
  categoryId: string
  player1: ChampionshipPlayer
  player2: ChampionshipPlayer
  level1: number
  level2: number
  status: EntryStatus
  note: string | null
  unavailabilityNote: string | null
  unavailabilityApproved: boolean
  createdAt: Date
  // Payments come back only to the pair and to staff (RLS).
  payments: EntryPayment[]
  // Block keys ('YYYY-MM-DD@HH:MM') the pair cannot play; only for the pair and staff (RLS).
  unavailable: string[]
}
export type ChampionshipCategory = {
  id: string
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
  status: CategoryStatus
  mergedInto: string | null
  // Oldest first: the order of the waiting line.
  entries: ChampionshipEntry[]
}
export type Championship = {
  id: string
  name: string
  rules: string
  posterPath: string | null
  status: ChampionshipStatus
  registrationOpensAt: Date | null
  registrationClosesAt: Date | null
  maxCategoriesPerPlayer: number
  windows: ChampionshipWindow[]
  categories: ChampionshipCategory[]
  // From the first day of play to the end of the last one; null without days.
  startsAt: Date | null
  endsAt: Date | null
}
export type Block = { key: string; date: LocalDate; fromTime: string; toTime: string }
export type MyEntry = { entry: ChampionshipEntry; category: ChampionshipCategory }
export type RegisterStatus = { ok: true; full: boolean } | { ok: false; reason: string }

// What lib/data/championships.ts reads. If supabase-js infers a slightly different shape for the embeds,
// adjust these types to match; never cast the query result.
type PlayerRow = { id: string; name: string; profile_id: string | null }
export type EntryRow = {
  id: string
  player1_level: number
  player2_level: number
  status: EntryStatus
  unavailability_approved: boolean
  created_at: string
  player1: PlayerRow | null
  player2: PlayerRow | null
  payments: EntryPayment[]
  unavailability: { on_date: string; from_time: string }[]
}
export type CategoryRow = {
  id: string
  name: string
  gender: CategoryGender
  level_min: number | null
  level_max: number | null
  min_pairs: number
  max_pairs: number
  price: number
  format: CategoryFormat
  group_size: number
  qualifiers_per_group: number
  match_minutes: number
  seeding: Seeding
  match_rules: unknown
  status: CategoryStatus
  merged_into: string | null
  sort_order: number
  entries: EntryRow[]
}
export type ChampionshipRow = {
  id: string
  name: string
  rules: string
  poster_path: string | null
  status: ChampionshipStatus
  registration_opens_at: string | null
  registration_closes_at: string | null
  max_categories_per_player: number
  windows: { id: string; on_date: string; from_time: string; to_time: string; court_ids: string[] }[]
  categories: CategoryRow[]
}

const NO_PLAYER: ChampionshipPlayer = { id: '', name: 'Jugador', profileId: null }

export function blockKey(date: LocalDate, fromTime: string): string {
  return `${date}@${fromTime}`
}

// The match rules jsonb; anything missing is the default (third set a super tie-break, no golden point, no time
// limit).
export function readMatchRules(value: unknown): { thirdSet: ThirdSet; goldenPoint: boolean; timeLimit: number | null } {
  const record = value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const limit = record.time_limit_minutes
  return {
    thirdSet: record.third_set === 'full' ? 'full' : 'super_tiebreak',
    goldenPoint: record.golden_point === true,
    timeLimit: typeof limit === 'number' && Number.isInteger(limit) && limit > 0 ? limit : null,
  }
}

// "Al mejor de 3 sets, sin límite de tiempo · Tercer set: súper tie-break a 10 · Punto de oro".
export function matchRulesText(category: Pick<ChampionshipCategory, 'thirdSet' | 'goldenPoint' | 'timeLimit'>): string {
  return [
    category.timeLimit === null
      ? 'Al mejor de 3 sets, sin límite de tiempo'
      : `Al mejor de 3 sets, con ${category.timeLimit} minutos de juego`,
    `Tercer set: ${THIRD_SET_LABELS[category.thirdSet].toLowerCase()}`,
    category.goldenPoint ? 'Punto de oro' : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

export function windowPeriod(window: ChampionshipWindow, timezone: string): { startsAt: Date; endsAt: Date } {
  return {
    startsAt: zonedTime(window.date, parseTime(window.fromTime), timezone),
    endsAt: zonedTime(window.date, parseTime(window.toTime), timezone),
  }
}

function toPlayer(row: PlayerRow | null): ChampionshipPlayer {
  return row ? { id: row.id, name: row.name, profileId: row.profile_id } : NO_PLAYER
}

// A pair's notes come apart (column privileges): public.championship_entry_notes, for staff and the pair.
export type EntryNotes = { note: string | null; unavailability_note: string | null }

function toEntry(row: EntryRow, categoryId: string, notes: Map<string, EntryNotes>): ChampionshipEntry {
  return {
    id: row.id,
    categoryId,
    player1: toPlayer(row.player1),
    player2: toPlayer(row.player2),
    level1: row.player1_level,
    level2: row.player2_level,
    status: row.status,
    note: notes.get(row.id)?.note ?? null,
    unavailabilityNote: notes.get(row.id)?.unavailability_note ?? null,
    unavailabilityApproved: row.unavailability_approved,
    createdAt: new Date(row.created_at),
    payments: row.payments,
    unavailable: row.unavailability.map((item) => blockKey(item.on_date, shortTime(item.from_time))).sort(),
  }
}

function toCategory(row: CategoryRow, notes: Map<string, EntryNotes>): ChampionshipCategory {
  const rules = readMatchRules(row.match_rules)
  return {
    id: row.id,
    name: row.name,
    gender: row.gender,
    levelMin: row.level_min,
    levelMax: row.level_max,
    minPairs: row.min_pairs,
    maxPairs: row.max_pairs,
    price: row.price,
    format: row.format,
    groupSize: row.group_size,
    qualifiers: row.qualifiers_per_group,
    matchMinutes: row.match_minutes,
    seeding: row.seeding,
    thirdSet: rules.thirdSet,
    goldenPoint: rules.goldenPoint,
    timeLimit: rules.timeLimit,
    status: row.status,
    mergedInto: row.merged_into,
    entries: row.entries
      .map((entry) => toEntry(entry, row.id, notes))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)),
  }
}

export function toChampionship(row: ChampionshipRow, timezone: string, notes: Map<string, EntryNotes> = new Map()): Championship {
  const windows = row.windows
    .map((window) => ({
      id: window.id,
      date: window.on_date,
      fromTime: shortTime(window.from_time),
      toTime: shortTime(window.to_time),
      courtIds: window.court_ids,
    }))
    .sort((a, b) => `${a.date} ${a.fromTime}`.localeCompare(`${b.date} ${b.fromTime}`))
  const periods = windows.map((window) => windowPeriod(window, timezone))
  return {
    id: row.id,
    name: row.name,
    rules: row.rules,
    posterPath: row.poster_path,
    status: row.status,
    registrationOpensAt: row.registration_opens_at ? new Date(row.registration_opens_at) : null,
    registrationClosesAt: row.registration_closes_at ? new Date(row.registration_closes_at) : null,
    maxCategoriesPerPlayer: row.max_categories_per_player,
    windows,
    categories: [...row.categories]
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'es'))
      .map((category) => toCategory(category, notes)),
    startsAt: periods.length > 0 ? new Date(Math.min(...periods.map((period) => period.startsAt.getTime()))) : null,
    endsAt: periods.length > 0 ? new Date(Math.max(...periods.map((period) => period.endsAt.getTime()))) : null,
  }
}

export function activeEntries(category: Pick<ChampionshipCategory, 'entries'>): ChampionshipEntry[] {
  return category.entries.filter((entry) => entry.status === 'active')
}

// Oldest first: the order in which they get in.
export function waitingEntries(category: Pick<ChampionshipCategory, 'entries'>): ChampionshipEntry[] {
  return category.entries.filter((entry) => entry.status === 'waiting')
}

// "9 de 12 parejas · 2 en espera".
export function spotsText(category: Pick<ChampionshipCategory, 'entries' | 'maxPairs'>): string {
  const waiting = waitingEntries(category).length
  const places = `${activeEntries(category).length} de ${category.maxPairs} parejas`
  return waiting > 0 ? `${places} · ${waiting} en espera` : places
}

export function waitingPosition(category: Pick<ChampionshipCategory, 'entries'>, entryId: string): number | null {
  const index = waitingEntries(category).findIndex((entry) => entry.id === entryId)
  return index === -1 ? null : index + 1
}

export function entryStateText(category: Pick<ChampionshipCategory, 'entries'>, entry: ChampionshipEntry): string {
  if (entry.status === 'waiting') return `En espera, puesto ${waitingPosition(category, entry.id)}`
  return ENTRY_STATUS_LABELS[entry.status]
}

export function pairName(entry: Pick<ChampionshipEntry, 'player1' | 'player2'>): string {
  return `${entry.player1.name} y ${entry.player2.name}`
}

export function isEntryPlayer(entry: Pick<ChampionshipEntry, 'player1' | 'player2'>, profileId: string): boolean {
  return entry.player1.profileId === profileId || entry.player2.profileId === profileId
}

export function partnerOf(entry: Pick<ChampionshipEntry, 'player1' | 'player2'>, profileId: string): ChampionshipPlayer {
  return entry.player1.profileId === profileId ? entry.player2 : entry.player1
}

// The viewer's pairs that are still in (with a place or waiting), with their category.
export function myEntries(championship: Pick<Championship, 'categories'>, profileId: string): MyEntry[] {
  return championship.categories.flatMap((category) =>
    category.entries
      .filter((entry) => (entry.status === 'active' || entry.status === 'waiting') && isEntryPlayer(entry, profileId))
      .map((entry) => ({ entry, category })),
  )
}

// Same rule as register_championship_pair: open, before the deadline.
export function registrationOpen(championship: Pick<Championship, 'status' | 'registrationClosesAt'>, now: Date): boolean {
  return (
    championship.status === 'registration' &&
    championship.registrationClosesAt !== null &&
    championship.registrationClosesAt.getTime() > now.getTime()
  )
}

// Whether the viewer can sign up to a category, the same rules as the database; full means the pair waits.
export function registerStatus(
  championship: Championship,
  category: ChampionshipCategory,
  profileId: string,
  now: Date,
): RegisterStatus {
  if (!registrationOpen(championship, now)) return { ok: false, reason: 'La inscripción está cerrada.' }
  if (category.status !== 'open') return { ok: false, reason: 'Esta categoría ya no recibe parejas.' }
  const mine = myEntries(championship, profileId)
  if (mine.some((item) => item.category.id === category.id)) return { ok: false, reason: 'Ya estás anotado en esta categoría.' }
  const max = championship.maxCategoriesPerPlayer
  if (mine.length >= max) {
    return { ok: false, reason: `Ya estás en ${max} ${max === 1 ? 'categoría' : 'categorías'}, el máximo de este campeonato.` }
  }
  return { ok: true, full: activeEntries(category).length >= category.maxPairs }
}

export function openCategories(championship: Pick<Championship, 'categories'>): ChampionshipCategory[] {
  return championship.categories.filter((category) => category.status === 'open')
}

// Categories with fewer pairs than they need: the organizer merges or cancels them.
export function smallCategories(championship: Pick<Championship, 'categories'>): ChampionshipCategory[] {
  return openCategories(championship).filter((category) => activeEntries(category).length < category.minPairs)
}

// The 2-hour blocks of the days of play, like private.championship_blocks.
export function championshipBlocks(windows: ChampionshipWindow[]): Block[] {
  const blocks = new Map<string, Block>()
  for (const window of windows) {
    const from = parseTime(window.fromTime)
    const to = parseTime(window.toTime)
    for (let minute = from; minute < to; minute += BLOCK_MINUTES) {
      const fromTime = formatMinutes(minute)
      const key = blockKey(window.date, fromTime)
      if (!blocks.has(key)) {
        blocks.set(key, {
          key,
          date: window.date,
          fromTime,
          toTime: minute + BLOCK_MINUTES >= to ? window.toTime : formatMinutes(minute + BLOCK_MINUTES),
        })
      }
    }
  }
  return [...blocks.values()].sort((a, b) => a.key.localeCompare(b.key))
}

// Up to 40 % of the blocks, like set_entry_unavailability (count * 5 <= total * 2).
export function maxUnavailable(total: number): number {
  return Math.floor((total * 2) / 5)
}

export function unavailabilityText(count: number): string {
  if (count === 0) return 'Pueden jugar en cualquier horario.'
  return count === 1 ? 'No pueden en 1 franja.' : `No pueden en ${count} franjas.`
}

// Like private.normalize_phone: digits only; +598 and 00598 become the local 0.
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/[^0-9]/g, '')
  if (digits.startsWith('00598')) digits = `0${digits.slice(5)}`
  else if (digits.startsWith('598') && digits.length === 11) digits = `0${digits.slice(3)}`
  else if (/^9[0-9]{7}$/.test(digits)) digits = `0${digits}`
  return /^[0-9]{8,15}$/.test(digits) ? digits : null
}

export function datesText(championship: Pick<Championship, 'windows'>): string {
  const dates = [...new Set(championship.windows.map((window) => window.date))].sort()
  if (dates.length === 0) return 'Sin días de juego todavía'
  if (dates.length === 1) return dayLongLabel(dates[0])
  return `Del ${dayLongLabel(dates[0])} al ${dayLongLabel(dates[dates.length - 1])}`
}

export function windowText(window: ChampionshipWindow): string {
  return `${dayLongLabel(window.date)}, ${window.fromTime} a ${window.toTime}`
}

export function closesText(championship: Pick<Championship, 'registrationClosesAt'>, timezone: string): string | null {
  const closes = championship.registrationClosesAt
  return closes ? `${dayLongLabel(localDateOf(closes, timezone))}, ${timeIn(closes, timezone)}` : null
}

export function priceText(price: number): string {
  return price > 0 ? `${formatPrice(price)} por pareja` : 'Sin costo'
}

export function levelText(category: Pick<ChampionshipCategory, 'levelMin' | 'levelMax'>): string | null {
  if (category.levelMin === null || category.levelMax === null) return null
  return category.levelMin === category.levelMax ? `${category.levelMin}ª` : `${category.levelMin}ª a ${category.levelMax}ª`
}

// "Damas · 5ª a 6ª · $1.800 por pareja".
export function categoryDetail(category: Pick<ChampionshipCategory, 'gender' | 'levelMin' | 'levelMax' | 'price'>): string {
  return [GENDER_LABELS[category.gender], levelText(category), priceText(category.price)].filter(Boolean).join(' · ')
}

// What a draft still needs before registration opens (open_championship_registration says the same).
export function championshipReadiness(championship: Pick<Championship, 'windows' | 'categories'>): string | null {
  if (championship.windows.length === 0) return 'Agregá al menos un día de juego.'
  if (openCategories(championship).length === 0) return 'Agregá al menos una categoría.'
  return null
}

// What the Torneos tab shows: championships out of draft, not cancelled nor finished, that did not end yet
// (or have no days yet), the first to start first.
export function upcomingChampionships(championships: Championship[], now: Date): Championship[] {
  return championships
    .filter(
      (championship) =>
        !['draft', 'cancelled', 'finished'].includes(championship.status) &&
        (championship.endsAt === null || championship.endsAt.getTime() > now.getTime()),
    )
    .sort((a, b) => (a.startsAt?.getTime() ?? Infinity) - (b.startsAt?.getTime() ?? Infinity))
}

// "1 pareja de 4 mínimas".
export function smallCategoryText(category: Pick<ChampionshipCategory, 'entries' | 'minPairs'>): string {
  const count = activeEntries(category).length
  return `${count} ${count === 1 ? 'pareja' : 'parejas'} de ${category.minPairs} mínimas`
}

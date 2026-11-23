import { DAY_BAND_WORDS, dayBandOf } from './availability'
import { WEEKDAYS_PLURAL, type Chip } from './match-suggestions'
import { categorySlashLabel, type MatchType } from './matches'
import { formatMinutes, localDateOf, minutesOfDay, weekdayOf } from './time'

// The assistant's rules (no AI): which category range and match type a free slot is worth, from the members who
// could play it (public.slot_candidates). A strong candidate played that weekday and time at least twice, or says
// she is usually free then.

// A row of public.slot_candidates.
export type CandidateRow = {
  player_id: string
  display_name: string
  category: number
  side: 'drive' | 'backhand' | 'both' | null
  gender: 'male' | 'female' | null
  times_played: number
  usually_free: boolean
  prefers_court: boolean
  score: number
}
export type Demand = 'high' | 'medium' | 'low'
export type Choice = { categoryMin: number; categoryMax: number; type: MatchType }
export type Proposal = Choice & { demand: Demand; strong: number; sideWarning: string | null }

// What the sheet starts with when nobody stands out: every category, mixed.
export const DEFAULT_CHOICE: Choice = { categoryMin: 1, categoryMax: 8, type: 'mixed' }

const CATEGORIES = [1, 2, 3, 4, 5, 6, 7, 8]
const FULL_MATCH = 4

export function isStrong(row: CandidateRow): boolean {
  return row.times_played >= 2 || row.usually_free
}

function inRange(row: CandidateRow, min: number, max: number): boolean {
  return row.category >= min && row.category <= max
}

export function fitsType(row: CandidateRow, type: MatchType): boolean {
  return type === 'mixed' || row.gender === type
}

export function fits(row: CandidateRow, choice: Choice): boolean {
  return inRange(row, choice.categoryMin, choice.categoryMax) && fitsType(row, choice.type)
}

type Range = { min: number; max: number; count: number; score: number }

function rangeOf(strong: CandidateRow[], min: number, max: number): Range {
  const rows = strong.filter((row) => inRange(row, min, max))
  return { min, max, count: rows.length, score: rows.reduce((total, row) => total + row.score, 0) }
}

// More strong candidates, then more score, then the lower category.
function better(a: Range, b: Range): boolean {
  if (a.count !== b.count) return a.count > b.count
  if (a.score !== b.score) return a.score > b.score
  return a.min < b.min
}

function bestRange(ranges: Range[]): Range {
  return ranges.reduce((best, range) => (better(range, best) ? range : best))
}

// A men's or women's match when four of one gender (and not of the other) would play; otherwise mixed.
function typeFor(rows: CandidateRow[]): MatchType {
  const male = rows.filter((row) => row.gender === 'male').length
  const female = rows.filter((row) => row.gender === 'female').length
  if (male >= FULL_MATCH && female < FULL_MATCH) return 'male'
  if (female >= FULL_MATCH && male < FULL_MATCH) return 'female'
  return 'mixed'
}

// Fewer than two for a side (those who play both count on each).
export function sideWarning(rows: CandidateRow[]): string | null {
  const drive = rows.filter((row) => row.side === 'drive' || row.side === 'both').length
  const backhand = rows.filter((row) => row.side === 'backhand' || row.side === 'both').length
  if (drive < 2 && backhand < 2) return 'Pocos de drive y de revés'
  if (drive < 2) return 'Pocos de drive'
  if (backhand < 2) return 'Pocos de revés'
  return null
}

export function demandOf(strong: number): Demand {
  if (strong >= 6) return 'high'
  if (strong >= 3) return 'medium'
  return 'low'
}

// One category when it fills a match on its own; otherwise the two neighbouring categories with the most strong
// candidates. null when nobody stands out.
export function propose(rows: CandidateRow[]): Proposal | null {
  const strong = rows.filter(isStrong)
  if (strong.length === 0) return null
  const single = bestRange(CATEGORIES.map((category) => rangeOf(strong, category, category)))
  const range =
    single.count >= FULL_MATCH
      ? single
      : bestRange(CATEGORIES.slice(0, -1).map((category) => rangeOf(strong, category, category + 1)))
  const inside = strong.filter((row) => inRange(row, range.min, range.max))
  const type = typeFor(inside)
  const fitting = inside.filter((row) => fitsType(row, type))
  return {
    categoryMin: range.min,
    categoryMax: range.max,
    type,
    demand: demandOf(fitting.length),
    strong: fitting.length,
    sideWarning: sideWarning(fitting),
  }
}

// "🔥 8 posibles" (high), "5 posibles" (medium), nothing when low.
export function demandText(proposal: Proposal): string | null {
  if (proposal.demand === 'high') return `🔥 ${proposal.strong} posibles`
  if (proposal.demand === 'medium') return `${proposal.strong} posibles`
  return null
}

export type SlotContext = { startsAt: Date; courtName: string; timezone: string }
export type CandidateView = { playerId: string; name: string; score: number; strong: boolean; chips: Chip[] }

// Who fits the chosen range and type, best first, with why: "Jugó 4 veces los martes 19:00", "Suele estar libre los
// martes de noche", "6ª, entra en 5ª/6ª". "hit" marks the reasons that make a strong candidate.
export function candidatesFor(rows: CandidateRow[], choice: Choice, context: SlotContext): CandidateView[] {
  const minutes = minutesOfDay(context.startsAt, context.timezone)
  const days = WEEKDAYS_PLURAL[weekdayOf(localDateOf(context.startsAt, context.timezone))]
  const range = categorySlashLabel(choice.categoryMin, choice.categoryMax)
  return rows
    .filter((row) => fits(row, choice))
    .sort((a, b) => b.score - a.score || a.display_name.localeCompare(b.display_name, 'es'))
    .map((row) => {
      const chips: Chip[] = []
      if (row.times_played > 0) {
        const times = row.times_played === 1 ? '1 vez' : `${row.times_played} veces`
        chips.push({ text: `Jugó ${times} los ${days} ${formatMinutes(minutes)}`, hit: row.times_played >= 2 })
      }
      if (row.usually_free) chips.push({ text: `Suele estar libre los ${days} ${DAY_BAND_WORDS[dayBandOf(minutes)]}`, hit: true })
      chips.push({
        text: choice.categoryMin === choice.categoryMax ? `${row.category}ª categoría` : `${row.category}ª, entra en ${range}`,
        hit: false,
      })
      if (row.prefers_court) chips.push({ text: `Prefiere la ${context.courtName}`, hit: false })
      return { playerId: row.player_id, name: row.display_name, score: row.score, strong: isStrong(row), chips }
    })
}

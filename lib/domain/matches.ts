import type { Gender, Side } from './profile'
import { priceFor, type PricingRule } from './slots'
import { localDateOf, minutesOfDay, toDate, type LocalDate } from './time'

export const MATCH_TYPES = ['male', 'female', 'mixed'] as const
export const SLOT_SIDES = ['drive', 'backhand'] as const
export const CANCEL_REASONS = ['no_court', 'not_filled', 'empty', 'by_club'] as const

export type MatchType = (typeof MATCH_TYPES)[number]
export type SlotSide = (typeof SLOT_SIDES)[number]
export type CancelReason = (typeof CANCEL_REASONS)[number]
export type MatchStatus = 'forming' | 'confirmed' | 'cancelled'

export const MATCH_TYPE_LABELS: Record<MatchType, string> = { male: 'Masculino', female: 'Femenino', mixed: 'Mixto' }
export const SLOT_SIDE_LABELS: Record<SlotSide, string> = { drive: 'Drive', backhand: 'Revés' }
// For sentences: "Falta 1 de revés", "Sumarme de drive".
export const SLOT_SIDE_WORDS: Record<SlotSide, string> = { drive: 'drive', backhand: 'revés' }
export const CANCEL_REASON_TEXT: Record<CancelReason, string> = {
  no_court: 'Se completaron los 4, pero no quedaba ninguna cancha libre a esa hora.',
  not_filled: 'No se completó a tiempo.',
  empty: 'Todos salieron del partido.',
  by_club: 'Lo canceló el club.',
}

export type Period = { startsAt: Date; endsAt: Date }
// Spots: 1 = team A drive, 2 = team A backhand, 3 = team B drive, 4 = team B backhand.
export type MatchSlot = { position: number; side: SlotSide; playerId: string | null; playerName: string | null }
export type Match = Period & {
  id: string
  preferredCourtId: string
  preferredCourtName: string
  courtId: string | null
  courtName: string | null
  allowOtherCourt: boolean
  categoryMin: number
  categoryMax: number
  type: MatchType
  status: MatchStatus
  cancelReason: CancelReason | null
  bookingId: string | null
  // Frozen when the match filled up; before that, the estimate for its slot.
  price: number | null
  slots: MatchSlot[]
}

export type MatchPlayer = { id: string; category: number | null; gender: Gender | null; side: Side | null }
export type JoinContext = { now: Date; closeHours: number; busy: Period[] }
// Keys: habitKey(weekday, minutes) for past games; availabilityKey(weekday, band) for bands.
export type Habits = { playedAt: Map<string, number>; availability: Set<string>; preferredCourtIds: Set<string> }
export type PlayerContext = { player: MatchPlayer; busy: Period[]; habits: Habits }

// What lib/data/matches.ts reads. If supabase-js infers a slightly different shape for the embeds,
// adjust this type to match; never cast the query result.
export type MatchRow = {
  id: string
  starts_at: string | null
  ends_at: string | null
  preferred_court_id: string
  court_id: string | null
  allow_other_court: boolean
  category_min: number
  category_max: number
  match_type: MatchType
  status: MatchStatus
  cancel_reason: string | null
  booking_id: string | null
  booking: { price: number } | null
  slots: {
    position: number
    side: 'drive' | 'backhand' | 'both'
    player_id: string | null
    player: { display_name: string } | null
  }[]
}

export type MatchLookups = { courtNames: Map<string, string>; rules: PricingRule[]; timezone: string }

export function isCancelReason(value: string | null): value is CancelReason {
  return value !== null && (CANCEL_REASONS as readonly string[]).includes(value)
}

export function toMatch(row: MatchRow, lookups: MatchLookups): Match {
  const startsAt = toDate(row.starts_at)
  const estimated = priceFor(lookups.rules, localDateOf(startsAt, lookups.timezone), minutesOfDay(startsAt, lookups.timezone))
  return {
    id: row.id,
    startsAt,
    endsAt: toDate(row.ends_at),
    preferredCourtId: row.preferred_court_id,
    preferredCourtName: lookups.courtNames.get(row.preferred_court_id) ?? 'Cancha',
    courtId: row.court_id,
    courtName: row.court_id ? (lookups.courtNames.get(row.court_id) ?? 'Cancha') : null,
    allowOtherCourt: row.allow_other_court,
    categoryMin: row.category_min,
    categoryMax: row.category_max,
    type: row.match_type,
    status: row.status,
    cancelReason: isCancelReason(row.cancel_reason) ? row.cancel_reason : null,
    bookingId: row.booking_id,
    price: row.booking?.price ?? estimated,
    slots: [...row.slots]
      .sort((a, b) => a.position - b.position)
      .map((slot) => ({
        position: slot.position,
        side: slot.side === 'backhand' ? 'backhand' : 'drive',
        playerId: slot.player_id,
        // A private profile is not readable by other members (RLS): the spot shows it is taken.
        playerName: slot.player_id ? (slot.player?.display_name ?? 'Jugador') : null,
      })),
  }
}

export function openSlots(match: Pick<Match, 'slots'>): MatchSlot[] {
  return match.slots.filter((slot) => slot.playerId === null)
}

export function filledCount(match: Pick<Match, 'slots'>): number {
  return match.slots.length - openSlots(match).length
}

export function isInMatch(match: Pick<Match, 'slots'>, playerId: string): boolean {
  return match.slots.some((slot) => slot.playerId === playerId)
}

export function overlaps(a: Period, b: Period): boolean {
  return a.startsAt < b.endsAt && a.endsAt > b.startsAt
}

// Same as private.match_closes_at.
export function closesAt(match: Pick<Match, 'startsAt'>, closeHours: number): Date {
  return new Date(match.startsAt.getTime() - closeHours * 3_600_000)
}

export function categoryRangeLabel(min: number, max: number): string {
  return min === max ? `${min}ª` : `${min}ª a ${max}ª`
}

export function missingText(match: Pick<Match, 'slots'>): string {
  const open = openSlots(match)
  if (open.length === 0) return 'Completo'
  const groups = SLOT_SIDES.map((side) => [side, open.filter((slot) => slot.side === side).length] as const).filter(
    ([, count]) => count > 0,
  )
  const verb = open.length === 1 ? 'Falta' : 'Faltan'
  if (groups.length === 1) return `${verb} ${open.length} de ${SLOT_SIDE_WORDS[groups[0][0]]}`
  return `${verb} ${open.length}: ${groups.map(([side, count]) => `${count} de ${SLOT_SIDE_WORDS[side]}`).join(' y ')}`
}

export function statusLabel(match: Match): string {
  if (match.status === 'confirmed') return `Confirmado, ${match.courtName ?? match.preferredCourtName}`
  if (match.status === 'cancelled') return 'Cancelado'
  return `Armándose, ${filledCount(match)} de 4`
}

// What each player pays, for "$400 c/u"; spot 1 also pays the remainder (match-payments.ts).
export function perPlayerPrice(price: number): number {
  return Math.floor(price / 4)
}

export function defaultCategoryRange(category: number | null): { min: number; max: number } {
  if (category === null) return { min: 1, max: 8 }
  return { min: Math.max(1, category - 1), max: Math.min(8, category + 1) }
}

// What the "Armar partido" sheet proposes: the player's category plus and minus one, his gender, his side.
export function matchFormDefaults(player: MatchPlayer): {
  categoryMin: number
  categoryMax: number
  type: MatchType
  side: SlotSide
} {
  const range = defaultCategoryRange(player.category)
  return {
    categoryMin: range.min,
    categoryMax: range.max,
    type: player.gender ?? 'mixed',
    side: player.side === 'backhand' ? 'backhand' : 'drive',
  }
}

// Choices for the "Armar partido" sheet (lib/data/matches.ts builds them).
export type MatchFormOptions = {
  days: { date: LocalDate; label: string }[]
  times: string[]
  courts: { id: string; name: string }[]
  defaults: ReturnType<typeof matchFormDefaults>
}

export function howItWorks(closeHours: number, noticeHours: number): string {
  return (
    `La cancha se reserva recién cuando están los 4. Si ${closeHours} h antes no se completó, el partido se cancela ` +
    `solo y no pagás nada. Cada jugador paga su parte. Para bajarte de un partido confirmado, avisá con ` +
    `${noticeHours} h de anticipación.`
  )
}

export type LeaveStatus = { allowed: true } | { allowed: false; reason: string } | null

// Same rule as leave_match (the database also stops someone who already paid).
export function leaveStatus(match: Match, playerId: string, noticeHours: number, now: Date): LeaveStatus {
  if (!isInMatch(match, playerId) || match.status === 'cancelled' || match.startsAt <= now) return null
  if (match.status === 'confirmed' && match.startsAt.getTime() - now.getTime() < noticeHours * 3_600_000) {
    return { allowed: false, reason: `Ya no podés bajarte: faltan menos de ${noticeHours} h. Avisá al club.` }
  }
  return { allowed: true }
}

export function joinResultMessage(
  result: { status: MatchStatus; cancelReason: CancelReason | null },
  courtName: string | null,
): string {
  if (result.status === 'confirmed') return `Partido confirmado en la ${courtName ?? 'cancha'}.`
  if (result.status === 'cancelled') return `El partido se canceló. ${CANCEL_REASON_TEXT[result.cancelReason ?? 'no_court']}`
  return 'Te sumaste al partido.'
}

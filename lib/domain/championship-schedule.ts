import type { Fixture, MatchSource, MatchStage } from './championship-fixture'
import { championshipBlocks, pairName, type Championship, type ChampionshipWindow } from './championships'
import { localDateOf, minutesOfDay, parseLocalDate, parseTime, zonedTime, type LocalDate } from './time'

// The schedule of a championship (design: "Programación"): every match on a court and a start inside the days of
// play, on the steps of its category's minutes. Hard rules: one match per court; nobody in two places at once (a
// player of two categories too); 45 minutes of rest for a pair; a knockout match after the ones that define it,
// plus the rest; no match when a known pair said it cannot play. Soft ones: no pair waits more than 3 hours on a
// day, finals at the end of the last day, courts used evenly. Most constrained first, the first valid start, then
// swaps. A side not known yet ("1° Zona A") is a token: two different tokens are never the same pair, and for
// players of two categories it stands for everyone in its group. save_championship_schedule checks the hard rules
// again.

export const REST_MINUTES = 45
export const LONG_WAIT_MINUTES = 180

export type ScheduleEntry = { id: string; name: string; playerIds: string[]; unavailable: string[] }
export type ScheduleMatch = {
  id: string
  categoryId: string
  minutes: number
  stage: MatchStage
  groupId: string | null
  round: number | null
  position: number | null
  entryA: string | null
  entryB: string | null
  sourceA: MatchSource | null
  sourceB: MatchSource | null
  pinned: boolean
  courtId: string | null
  startsAt: Date | null
}
export type ScheduleInput = {
  timezone: string
  windows: ChampionshipWindow[]
  entries: ScheduleEntry[]
  matches: ScheduleMatch[]
}
export type ScheduledSlot = { matchId: string; courtId: string; startsAt: Date; endsAt: Date }
export type Unplaced = { matchId: string; reason: string }
export type ScheduleResult = { slots: ScheduledSlot[]; unplaced: Unplaced[] }
export type SlotOption = { courtId: string; startsAt: Date }
export type ScheduleProblem = 'order' | 'unavailable' | 'rest' | 'players' | 'court'

// A start on a court, in minutes of the club's wall clock counted from 1970-01-01, so days compare.
type Slot = { courtId: string; date: LocalDate; start: number; end: number }
type Found = { problem: ScheduleProblem; entryId: string | null }
type Plan = {
  byId: Map<string, ScheduleMatch>
  tokens: Map<string, string[]>
  players: Map<string, string[]>
  feeders: Map<string, string[]>
  dependents: Map<string, string[]>
  unavailable: Map<string, { start: number; end: number }[]>
  entryName: Map<string, string>
  candidates: Map<string, Slot[]>
  courtOrder: Map<string, number>
  categoryOrder: Map<string, number>
  lastDate: LocalDate
  placed: Map<string, Slot>
  byCourt: Map<string, Set<string>>
  byToken: Map<string, Set<string>>
  byPlayer: Map<string, Set<string>>
}

const REASONS: Record<ScheduleProblem, (name: string | null) => string> = {
  order: () => 'Los partidos que lo definen terminan tarde: no queda horario después del descanso.',
  unavailable: (name) => `${name ?? 'Una pareja'} no tiene horario disponible en los días de juego.`,
  rest: (name) => `${name ?? 'Una pareja'} no llega a descansar 45 minutos entre partidos.`,
  players: () => 'Algún jugador ya juega en otra categoría en los horarios que quedan.',
  court: () => 'No quedan canchas libres en los días de juego.',
}

function dayStart(date: LocalDate): number {
  const { year, month, day } = parseLocalDate(date)
  return Date.UTC(year, month - 1, day) / 60_000
}

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end
}

function addTo(map: Map<string, Set<string>>, key: string, id: string): void {
  const set = map.get(key) ?? new Set<string>()
  set.add(id)
  map.set(key, set)
}

function toSlot(match: ScheduleMatch, timezone: string): Slot | null {
  if (!match.courtId || !match.startsAt) return null
  const date = localDateOf(match.startsAt, timezone)
  const start = dayStart(date) + minutesOfDay(match.startsAt, timezone)
  return { courtId: match.courtId, date, start, end: start + match.minutes }
}

function instant(slot: Slot, minute: number, timezone: string): Date {
  return zonedTime(slot.date, minute - dayStart(slot.date), timezone)
}

// Every start of every day of play on each of its courts, on the steps of `minutes`.
function candidatesFor(windows: ChampionshipWindow[], minutes: number, courtOrder: Map<string, number>): Slot[] {
  const out: Slot[] = []
  for (const window of windows) {
    const base = dayStart(window.date)
    const to = parseTime(window.toTime)
    for (let start = parseTime(window.fromTime); start + minutes <= to; start += minutes) {
      for (const courtId of window.courtIds) {
        out.push({ courtId, date: window.date, start: base + start, end: base + start + minutes })
      }
    }
  }
  return out.sort((a, b) => a.start - b.start || (courtOrder.get(a.courtId) ?? 0) - (courtOrder.get(b.courtId) ?? 0))
}

function makePlan(input: ScheduleInput): Plan {
  const byId = new Map(input.matches.map((match) => [match.id, match]))
  const entries = new Map(input.entries.map((entry) => [entry.id, entry]))
  const groupMembers = new Map<string, Set<string>>()
  const groupMatches = new Map<string, string[]>()
  for (const match of input.matches) {
    if (match.stage !== 'group' || !match.groupId) continue
    groupMatches.set(match.groupId, [...(groupMatches.get(match.groupId) ?? []), match.id])
    for (const entryId of [match.entryA, match.entryB]) if (entryId) addTo(groupMembers, match.groupId, entryId)
  }

  const tokens = new Map<string, string[]>()
  const tokensOf = (match: ScheduleMatch): string[] => {
    const known = tokens.get(match.id)
    if (known) return known
    const out = new Set<string>()
    const sides: [string | null, MatchSource | null][] = [
      [match.entryA, match.sourceA],
      [match.entryB, match.sourceB],
    ]
    for (const [entryId, source] of sides) {
      if (entryId) out.add(`entry:${entryId}`)
      else if (source?.kind === 'group') out.add(`group:${source.groupId}#${source.place}`)
      else if (source?.kind === 'winner') {
        const feeder = byId.get(source.matchId)
        if (feeder) for (const token of tokensOf(feeder)) out.add(token)
      }
    }
    tokens.set(match.id, [...out])
    return [...out]
  }
  const playersOfToken = (token: string): string[] => {
    if (token.startsWith('entry:')) return entries.get(token.slice(6))?.playerIds ?? []
    const groupId = token.slice(6, token.lastIndexOf('#'))
    return [...(groupMembers.get(groupId) ?? [])].flatMap((entryId) => entries.get(entryId)?.playerIds ?? [])
  }

  const players = new Map<string, string[]>()
  const feeders = new Map<string, string[]>()
  const dependents = new Map<string, string[]>()
  for (const match of input.matches) {
    players.set(match.id, [...new Set(tokensOf(match).flatMap(playersOfToken))])
    const before = new Set(
      [match.sourceA, match.sourceB].flatMap((source) =>
        source?.kind === 'winner'
          ? [source.matchId]
          : source?.kind === 'group'
            ? (groupMatches.get(source.groupId) ?? [])
            : [],
      ),
    )
    feeders.set(match.id, [...before])
    for (const feederId of before) dependents.set(feederId, [...(dependents.get(feederId) ?? []), match.id])
  }

  const blocks = championshipBlocks(input.windows)
  const unavailable = new Map(
    input.entries.map((entry) => [
      entry.id,
      blocks
        .filter((block) => entry.unavailable.includes(block.key))
        .map((block) => ({
          start: dayStart(block.date) + parseTime(block.fromTime),
          end: dayStart(block.date) + parseTime(block.toTime),
        })),
    ]),
  )
  const courtOrder = new Map<string, number>()
  for (const window of input.windows) {
    for (const courtId of window.courtIds) if (!courtOrder.has(courtId)) courtOrder.set(courtId, courtOrder.size)
  }
  const categoryOrder = new Map<string, number>()
  for (const match of input.matches) {
    if (!categoryOrder.has(match.categoryId)) categoryOrder.set(match.categoryId, categoryOrder.size)
  }
  const byMinutes = new Map<number, Slot[]>()
  const candidates = new Map(
    input.matches.map((match) => {
      const list = byMinutes.get(match.minutes) ?? candidatesFor(input.windows, match.minutes, courtOrder)
      byMinutes.set(match.minutes, list)
      return [match.id, list]
    }),
  )
  return {
    byId,
    tokens,
    players,
    feeders,
    dependents,
    unavailable,
    entryName: new Map(input.entries.map((entry) => [entry.id, entry.name])),
    candidates,
    courtOrder,
    categoryOrder,
    lastDate: input.windows.reduce((last, window) => (window.date > last ? window.date : last), ''),
    placed: new Map(),
    byCourt: new Map(),
    byToken: new Map(),
    byPlayer: new Map(),
  }
}

function place(plan: Plan, matchId: string, slot: Slot): void {
  plan.placed.set(matchId, slot)
  addTo(plan.byCourt, slot.courtId, matchId)
  for (const token of plan.tokens.get(matchId) ?? []) addTo(plan.byToken, token, matchId)
  for (const player of plan.players.get(matchId) ?? []) addTo(plan.byPlayer, player, matchId)
}

function unplace(plan: Plan, matchId: string): void {
  const slot = plan.placed.get(matchId)
  if (!slot) return
  plan.placed.delete(matchId)
  plan.byCourt.get(slot.courtId)?.delete(matchId)
  for (const token of plan.tokens.get(matchId) ?? []) plan.byToken.get(token)?.delete(matchId)
  for (const player of plan.players.get(matchId) ?? []) plan.byPlayer.get(player)?.delete(matchId)
}

function placeAll(plan: Plan, input: ScheduleInput, except?: string): void {
  for (const match of input.matches) {
    const slot = match.id === except ? null : toSlot(match, input.timezone)
    if (slot) place(plan, match.id, slot)
  }
}

// The first hard rule a match breaks at that slot, against what is placed; null when it fits.
function problemAt(plan: Plan, match: ScheduleMatch, slot: Slot): Found | null {
  for (const feederId of plan.feeders.get(match.id) ?? []) {
    const feeder = plan.placed.get(feederId)
    if (!feeder || slot.start < feeder.end + REST_MINUTES) return { problem: 'order', entryId: null }
  }
  for (const dependentId of plan.dependents.get(match.id) ?? []) {
    const dependent = plan.placed.get(dependentId)
    if (dependent && dependent.start < slot.end + REST_MINUTES) return { problem: 'order', entryId: null }
  }
  for (const entryId of [match.entryA, match.entryB]) {
    if (entryId && (plan.unavailable.get(entryId) ?? []).some((block) => overlaps(block, slot))) {
      return { problem: 'unavailable', entryId }
    }
  }
  for (const token of plan.tokens.get(match.id) ?? []) {
    for (const otherId of plan.byToken.get(token) ?? []) {
      const other = plan.placed.get(otherId)
      if (otherId === match.id || !other) continue
      if (slot.start < other.end + REST_MINUTES && other.start < slot.end + REST_MINUTES) {
        return { problem: 'rest', entryId: token.startsWith('entry:') ? token.slice(6) : null }
      }
    }
  }
  for (const player of plan.players.get(match.id) ?? []) {
    for (const otherId of plan.byPlayer.get(player) ?? []) {
      const other = plan.placed.get(otherId)
      if (otherId === match.id || !other || plan.byId.get(otherId)?.categoryId === match.categoryId) continue
      if (overlaps(slot, other)) return { problem: 'players', entryId: null }
    }
  }
  for (const otherId of plan.byCourt.get(slot.courtId) ?? []) {
    const other = plan.placed.get(otherId)
    if (otherId !== match.id && other && overlaps(slot, other)) return { problem: 'court', entryId: null }
  }
  return null
}

// How many of the match's known pairs would wait more than 3 hours on that day for their match before or after.
function waitPenalty(plan: Plan, match: ScheduleMatch, slot: Slot): number {
  let penalty = 0
  for (const entryId of [match.entryA, match.entryB]) {
    if (!entryId) continue
    let nearest = Infinity
    for (const otherId of plan.byToken.get(`entry:${entryId}`) ?? []) {
      const other = plan.placed.get(otherId)
      if (otherId === match.id || !other || other.date !== slot.date) continue
      nearest = Math.min(nearest, other.end <= slot.start ? slot.start - other.end : other.start - slot.end)
    }
    if (nearest !== Infinity && nearest > LONG_WAIT_MINUTES) penalty++
  }
  return penalty
}

// Smaller is better. A final: the last day, as late as it fits. Any other match: no long wait, the first start,
// the least used court.
function scoreOf(plan: Plan, match: ScheduleMatch, slot: Slot): number[] {
  const courtUse = plan.byCourt.get(slot.courtId)?.size ?? 0
  const court = plan.courtOrder.get(slot.courtId) ?? 0
  if (match.stage === 'knockout' && match.round === 1) {
    return [slot.date === plan.lastDate ? 0 : 1, -slot.start, courtUse, court]
  }
  return [waitPenalty(plan, match, slot), slot.start, courtUse, court]
}

function better(a: number[], b: number[]): boolean {
  for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) return a[index] < b[index]
  return false
}

function placeBest(plan: Plan, match: ScheduleMatch): void {
  let best: Slot | null = null
  let bestScore: number[] = []
  for (const slot of plan.candidates.get(match.id) ?? []) {
    if (problemAt(plan, match, slot)) continue
    const score = scoreOf(plan, match, slot)
    if (!best || better(score, bestScore)) {
      best = slot
      bestScore = score
    }
  }
  if (best) place(plan, match.id, best)
}

// How many starts a pair's unavailability leaves to a match: the fewest go first.
function freeSlots(plan: Plan, match: ScheduleMatch): number {
  return (plan.candidates.get(match.id) ?? []).filter((slot) =>
    [match.entryA, match.entryB].every(
      (entryId) => !entryId || !(plan.unavailable.get(entryId) ?? []).some((block) => overlaps(block, slot)),
    ),
  ).length
}

// Swaps two group matches of the same length when that shortens long waits and keeps every hard rule.
function improve(plan: Plan, movable: ScheduleMatch[]): void {
  for (const x of movable) {
    const sx = plan.placed.get(x.id)
    if (!sx || waitPenalty(plan, x, sx) === 0) continue
    for (const y of movable) {
      const sy = plan.placed.get(y.id)
      if (y.id === x.id || y.minutes !== x.minutes || !sy) continue
      const before = waitPenalty(plan, x, sx) + waitPenalty(plan, y, sy)
      unplace(plan, x.id)
      unplace(plan, y.id)
      let swapped = false
      if (!problemAt(plan, x, sy)) {
        place(plan, x.id, sy)
        if (!problemAt(plan, y, sx)) {
          place(plan, y.id, sx)
          if (waitPenalty(plan, x, sy) + waitPenalty(plan, y, sx) < before) swapped = true
          else unplace(plan, y.id)
        }
        if (!swapped) unplace(plan, x.id)
      }
      if (swapped) break
      place(plan, x.id, sx)
      place(plan, y.id, sy)
    }
  }
}

function reasonFor(plan: Plan, match: ScheduleMatch): string {
  const candidates = plan.candidates.get(match.id) ?? []
  if (candidates.length === 0) return `Ningún día de juego tiene lugar para un partido de ${match.minutes} minutos.`
  const counts = new Map<ScheduleProblem, { count: number; entryId: string | null }>()
  for (const slot of candidates) {
    const found = problemAt(plan, match, slot)
    if (!found) return 'Hay lugar: volvé a programar o ubicalo a mano.'
    const current = counts.get(found.problem)
    counts.set(found.problem, { count: (current?.count ?? 0) + 1, entryId: current?.entryId ?? found.entryId })
  }
  const [problem, { entryId }] = [...counts.entries()].sort((a, b) => b[1].count - a[1].count)[0]
  return REASONS[problem](entryId ? (plan.entryName.get(entryId) ?? null) : null)
}

export function scheduleChampionship(input: ScheduleInput): ScheduleResult {
  const plan = makePlan(input)
  const free: ScheduleMatch[] = []
  for (const match of input.matches) {
    const slot = match.pinned ? toSlot(match, input.timezone) : null
    if (slot) place(plan, match.id, slot)
    else free.push(match)
  }
  const category = (match: ScheduleMatch) => plan.categoryOrder.get(match.categoryId) ?? 0
  const room = new Map(free.map((match) => [match.id, freeSlots(plan, match)]))
  const groupStage = free
    .filter((match) => match.stage === 'group')
    .sort((a, b) => (room.get(a.id) ?? 0) - (room.get(b.id) ?? 0) || category(a) - category(b))
  for (const match of groupStage) placeBest(plan, match)
  improve(plan, groupStage)
  const knockout = free
    .filter((match) => match.stage === 'knockout')
    .sort((a, b) => (b.round ?? 0) - (a.round ?? 0) || category(a) - category(b) || (a.position ?? 0) - (b.position ?? 0))
  for (const match of knockout) placeBest(plan, match)

  return {
    slots: free.flatMap((match) => {
      const slot = plan.placed.get(match.id)
      return slot
        ? [{
            matchId: match.id,
            courtId: slot.courtId,
            startsAt: instant(slot, slot.start, input.timezone),
            endsAt: instant(slot, slot.end, input.timezone),
          }]
        : []
    }),
    unplaced: free.filter((match) => !plan.placed.has(match.id)).map((match) => ({ matchId: match.id, reason: reasonFor(plan, match) })),
  }
}

// "Editar": every other court and start where the match fits, the rest staying where they are.
export function slotOptions(input: ScheduleInput, matchId: string): SlotOption[] {
  const plan = makePlan(input)
  const match = plan.byId.get(matchId)
  if (!match) return []
  placeAll(plan, input, matchId)
  const current = toSlot(match, input.timezone)
  return (plan.candidates.get(matchId) ?? [])
    .filter((slot) => !(current && slot.courtId === current.courtId && slot.start === current.start))
    .filter((slot) => !problemAt(plan, match, slot))
    .map((slot) => ({ courtId: slot.courtId, startsAt: instant(slot, slot.start, input.timezone) }))
}

// Why each match without a court has none, given where the rest are.
export function unplacedReasons(input: ScheduleInput): Unplaced[] {
  const plan = makePlan(input)
  placeAll(plan, input)
  return input.matches
    .filter((match) => !plan.placed.has(match.id))
    .map((match) => ({ matchId: match.id, reason: reasonFor(plan, match) }))
}

// The hard rules each placed match breaks (none, for a schedule this module made).
export function checkSchedule(input: ScheduleInput): { matchId: string; problem: ScheduleProblem }[] {
  const plan = makePlan(input)
  placeAll(plan, input)
  const out: { matchId: string; problem: ScheduleProblem }[] = []
  for (const match of input.matches) {
    const slot = plan.placed.get(match.id)
    if (!slot) continue
    unplace(plan, match.id)
    const found = problemAt(plan, match, slot)
    place(plan, match.id, slot)
    if (found) out.push({ matchId: match.id, problem: found.problem })
  }
  return out
}

// The input with the result in place: the slots given, pinned matches where they were, the rest without a court.
export function applySchedule(input: ScheduleInput, result: ScheduleResult): ScheduleInput {
  const slots = new Map(result.slots.map((slot) => [slot.matchId, slot]))
  return {
    ...input,
    matches: input.matches.map((match) => {
      const slot = slots.get(match.id)
      if (slot) return { ...match, courtId: slot.courtId, startsAt: slot.startsAt }
      return match.pinned ? match : { ...match, courtId: null, startsAt: null }
    }),
  }
}

// The championship's pairs with a place and its matches, in the order of its categories.
export function scheduleInput(
  championship: Pick<Championship, 'windows' | 'categories'>,
  fixture: Fixture,
  timezone: string,
): ScheduleInput {
  const minutes = new Map(championship.categories.map((category) => [category.id, category.matchMinutes]))
  const order = new Map(championship.categories.map((category, index) => [category.id, index]))
  return {
    timezone,
    windows: championship.windows,
    entries: championship.categories.flatMap((category) =>
      category.entries
        .filter((entry) => entry.status === 'active')
        .map((entry) => ({
          id: entry.id,
          name: pairName(entry),
          playerIds: [entry.player1.id, entry.player2.id],
          unavailable: entry.unavailable,
        })),
    ),
    matches: [...fixture.matches]
      .sort((a, b) => (order.get(a.categoryId) ?? 0) - (order.get(b.categoryId) ?? 0))
      .map((match) => ({
        id: match.id,
        categoryId: match.categoryId,
        minutes: minutes.get(match.categoryId) ?? 90,
        stage: match.stage,
        groupId: match.groupId,
        round: match.round,
        position: match.position,
        entryA: match.entryA,
        entryB: match.entryB,
        sourceA: match.sourceA,
        sourceB: match.sourceB,
        pinned: match.pinned,
        courtId: match.courtId,
        startsAt: match.startsAt,
      })),
  }
}

// What save_championship_schedule takes.
export function schedulePayload(result: ScheduleResult) {
  return result.slots.map((slot) => ({
    match_id: slot.matchId,
    court_id: slot.courtId,
    starts_at: slot.startsAt.toISOString(),
  }))
}

import { capitalize, WEEKDAYS_LONG } from './format'
import type { DayGrid } from './grid'
import { categorySlashLabel, MATCH_TYPE_LABELS } from './matches'
import { propose, type CandidateRow, type Demand, type Proposal } from './slot-planner'
import { localDateOf, weekdayOf } from './time'

// The assistant's board: the day's times still to come, court by court, and the free slots worth a match.

// A free slot that still takes a match, with who could play it.
export type BoardSlot = {
  key: string
  courtId: string
  courtName: string
  startsAt: Date
  label: string
  rows: CandidateRow[]
  proposal: Proposal | null
}
export type RecommendedSlot = BoardSlot & { proposal: Proposal }
// free with slot null: still free to book, but past the match closing time.
export type BoardCell =
  | { state: 'free'; slot: BoardSlot | null }
  | { state: 'taken' }
  | { state: 'forming'; matchId: string; filled: number }
  | { state: 'none' }
export type AssistantBoard = { courts: { id: string; name: string }[]; rows: { label: string; cells: BoardCell[] }[] }

const DEMAND_RANK: Record<Demand, number> = { high: 0, medium: 1, low: 2 }
const MAX_RECOMMENDED = 3

export function slotKey(courtId: string, startsAt: Date): string {
  return `${courtId}|${startsAt.toISOString()}`
}

// Same as private.match_closes_at: a match takes players until close_hours before it starts.
export function acceptsMatch(startsAt: Date, now: Date, closeHours: number): boolean {
  return now.getTime() < startsAt.getTime() - closeHours * 3_600_000
}

// The slots lib/data/assistant.ts asks slot_candidates about: free, no match forming there, not closed yet.
export function buildableSlots(grid: DayGrid, now: Date, closeHours: number): { courtId: string; startsAt: Date }[] {
  return grid.rows.flatMap((row) =>
    row.cells.flatMap((cell) =>
      cell.state === 'free' && !cell.formingMatch && acceptsMatch(cell.slot.startsAt, now, closeHours)
        ? [{ courtId: cell.court.id, startsAt: cell.slot.startsAt }]
        : [],
    ),
  )
}

// candidates: the slot_candidates rows of each buildable slot, by slotKey.
export function boardOf(grid: DayGrid, candidates: Map<string, CandidateRow[]>): AssistantBoard {
  return {
    courts: grid.courts.map((court) => ({ id: court.id, name: court.name })),
    rows: grid.rows
      .filter((row) => !row.past)
      .map((row) => ({
        label: row.slot.label,
        cells: row.cells.map((cell): BoardCell => {
          if (cell.state === 'mine' || cell.state === 'taken') return { state: 'taken' }
          if (cell.state !== 'free') return { state: 'none' }
          if (cell.formingMatch) return { state: 'forming', matchId: cell.formingMatch.id, filled: cell.formingMatch.filled }
          const key = slotKey(cell.court.id, cell.slot.startsAt)
          const rows = candidates.get(key)
          if (!rows) return { state: 'free', slot: null }
          return {
            state: 'free',
            slot: {
              key,
              courtId: cell.court.id,
              courtName: cell.court.name,
              startsAt: cell.slot.startsAt,
              label: cell.slot.label,
              rows,
              proposal: propose(rows),
            },
          }
        }),
      })),
  }
}

// Up to three free slots with medium or high demand that still take a match: by demand, strong candidates and
// time, and never two at the same time.
export function recommendedSlots(board: AssistantBoard, now: Date, closeHours: number): RecommendedSlot[] {
  const open = board.rows.flatMap((row) =>
    row.cells.flatMap((cell): RecommendedSlot[] => {
      if (cell.state !== 'free' || !cell.slot) return []
      const { proposal } = cell.slot
      if (!proposal || proposal.demand === 'low' || !acceptsMatch(cell.slot.startsAt, now, closeHours)) return []
      return [{ ...cell.slot, proposal }]
    }),
  )
  open.sort(
    (a, b) =>
      DEMAND_RANK[a.proposal.demand] - DEMAND_RANK[b.proposal.demand] ||
      b.proposal.strong - a.proposal.strong ||
      a.startsAt.getTime() - b.startsAt.getTime(),
  )
  const picked: RecommendedSlot[] = []
  for (const slot of open) {
    if (picked.length === MAX_RECOMMENDED) break
    if (picked.some((other) => other.startsAt.getTime() === slot.startsAt.getTime())) continue
    picked.push(slot)
  }
  return picked
}

// "Martes 19:00 · Cancha 2 · 5ª/6ª mixto · 8 posibles"
export function recommendationText(slot: RecommendedSlot, timezone: string): string {
  const { proposal } = slot
  const weekday = WEEKDAYS_LONG[weekdayOf(localDateOf(slot.startsAt, timezone))]
  return [
    `${capitalize(weekday)} ${slot.label}`,
    slot.courtName,
    `${categorySlashLabel(proposal.categoryMin, proposal.categoryMax)} ${MATCH_TYPE_LABELS[proposal.type].toLowerCase()}`,
    `${proposal.strong} posibles`,
  ].join(' · ')
}

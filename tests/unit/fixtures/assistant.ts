import { slotKey, type BoardSlot } from '@/lib/domain/assistant-board'
import { propose, type CandidateRow } from '@/lib/domain/slot-planner'
import { at } from './grid'

// A strong candidate by default: category 5, male, drive, usually free, score 20.
export function candidate(id: string, overrides: Partial<CandidateRow> = {}): CandidateRow {
  return {
    player_id: id,
    display_name: `Jugador ${id}`,
    category: 5,
    side: 'drive',
    gender: 'male',
    times_played: 0,
    usually_free: true,
    prefers_court: false,
    score: 20,
    ...overrides,
  }
}

// n strong men of category 5, drive and backhand in turns.
export function strongRows(n: number, prefix = 'p'): CandidateRow[] {
  return Array.from({ length: n }, (_, index) =>
    candidate(`${prefix}${index + 1}`, { side: index % 2 === 0 ? 'drive' : 'backhand' }),
  )
}

// A free slot of the grid fixture's day (Thursday 2026-10-01) with its candidates and proposal.
export function boardSlot(courtId: string, hhmm: string, rows: CandidateRow[]): BoardSlot {
  return {
    key: slotKey(courtId, at(hhmm)),
    courtId,
    courtName: courtId === 'court-1' ? 'Cancha 1' : 'Cancha 2',
    startsAt: at(hhmm),
    label: hhmm,
    rows,
    proposal: propose(rows),
  }
}

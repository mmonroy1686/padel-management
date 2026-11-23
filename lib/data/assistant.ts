import 'server-only'
import type { Club } from '@/lib/auth/viewer'
import { boardOf, buildableSlots, slotKey, type AssistantBoard } from '@/lib/domain/assistant-board'
import type { DayGrid } from '@/lib/domain/grid'
import type { CandidateRow } from '@/lib/domain/slot-planner'
import type { LocalDate } from '@/lib/domain/time'
import { createClient } from '@/lib/supabase/server'
import { loadDayGrid } from './day'

export type AssistantDay = { grid: DayGrid; board: AssistantBoard }

// The assistant's day, read with staff's session: the grid (with its forming matches) and, for each free slot that
// still takes a match, who could play it. One slot_candidates call per slot (about 40 on a full day); if that ever
// weighs, join them in one RPC per day.
export async function loadAssistantDay(
  club: Club,
  date: LocalDate,
  viewer: { userId: string },
  now = new Date(),
): Promise<AssistantDay> {
  const grid = await loadDayGrid(club, date, { userId: viewer.userId, audience: 'staff' }, now)
  const supabase = await createClient()
  const answers = await Promise.all(
    buildableSlots(grid, now, club.match_close_minutes).map(async (slot): Promise<[string, CandidateRow[]]> => {
      const { data, error } = await supabase.rpc('slot_candidates', {
        p_court_id: slot.courtId,
        p_starts_at: slot.startsAt.toISOString(),
      })
      if (error) throw error
      return [slotKey(slot.courtId, slot.startsAt), data]
    }),
  )
  return { grid, board: boardOf(grid, new Map(answers)) }
}

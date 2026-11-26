import 'server-only'
import type { Club } from '@/lib/auth/viewer'
import { countFree, firstFree } from '@/lib/domain/grid'
import type { NextFree } from '@/lib/domain/next-free'
import { addDays, type LocalDate } from '@/lib/domain/time'
import { loadDayGrid } from './day'

// The first day after `from`, up to `until` (included), with a free slot for this player: where a full day sends
// them instead of a dead end. One day at a time, stopping at the first with room (usually the next one).
export async function loadNextFree(
  club: Club,
  userId: string,
  from: LocalDate,
  until: LocalDate,
  now: Date,
): Promise<NextFree | null> {
  for (let date = addDays(from, 1); date <= until; date = addDays(date, 1)) {
    const grid = await loadDayGrid(club, date, { userId, audience: 'player' }, now)
    const first = firstFree(grid.rows)
    if (first) return { date, ...first, free: countFree(grid.rows) }
  }
  return null
}

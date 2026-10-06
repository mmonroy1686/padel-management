import { isDone, type FixtureGroup, type FixtureMatch, type MatchSet } from './championship-fixture'
import type { CategoryFormat } from './championships'

// A group's table (design: "Desempate de zona"): matches won; between two level pairs, the match between them;
// then set difference and game difference. What is still level is the organizer's (a draw from the app). A W.O.
// counts 6-0 6-0 (record_walkover stores it so) and a super tie-break one game.

export type StandingRow = {
  entryId: string
  played: number
  won: number
  lost: number
  setsWon: number
  setsLost: number
  gamesWon: number
  gamesLost: number
}
export type GroupStandings = { rows: StandingRow[]; complete: boolean; tied: string[][] }
export type ClosingOrder = { ok: true; order: string[] } | { ok: false; reason: 'incomplete' | 'tied'; tied: string[][] }

const setDiff = (row: StandingRow) => row.setsWon - row.setsLost
const gameDiff = (row: StandingRow) => row.gamesWon - row.gamesLost

function count(row: StandingRow, sets: MatchSet[], side: 'a' | 'b'): void {
  for (const item of sets) {
    const own = side === 'a' ? item.a : item.b
    const other = side === 'a' ? item.b : item.a
    if (own > other) row.setsWon++
    else if (other > own) row.setsLost++
    if (item.superTiebreak) {
      if (own > other) row.gamesWon++
      else if (other > own) row.gamesLost++
    } else {
      row.gamesWon += own
      row.gamesLost += other
    }
  }
}

function headToHead(a: string, b: string, matches: FixtureMatch[]): string | null {
  const match = matches.find(
    (item) => isDone(item) && ((item.entryA === a && item.entryB === b) || (item.entryA === b && item.entryB === a)),
  )
  return match?.winner ?? null
}

function breakTie(level: StandingRow[], matches: FixtureMatch[], tied: string[][]): StandingRow[] {
  if (level.length === 1) return level
  if (level.length === 2) {
    const winner = headToHead(level[0].entryId, level[1].entryId, matches)
    if (winner === level[0].entryId) return level
    if (winner === level[1].entryId) return [level[1], level[0]]
  }
  const sorted = [...level].sort((a, b) => setDiff(b) - setDiff(a) || gameDiff(b) - gameDiff(a))
  const out: StandingRow[] = []
  let start = 0
  while (start < sorted.length) {
    let end = start + 1
    while (
      end < sorted.length &&
      setDiff(sorted[end]) === setDiff(sorted[start]) &&
      gameDiff(sorted[end]) === gameDiff(sorted[start])
    ) {
      end++
    }
    const still = sorted.slice(start, end)
    const winner = still.length === 2 && level.length > 2 ? headToHead(still[0].entryId, still[1].entryId, matches) : null
    if (winner) {
      out.push(...(winner === still[0].entryId ? still : [still[1], still[0]]))
    } else {
      if (still.length > 1) tied.push(still.map((row) => row.entryId))
      out.push(...still)
    }
    start = end
  }
  return out
}

export function groupStandings(group: FixtureGroup, matches: FixtureMatch[]): GroupStandings {
  const own = matches.filter((match) => match.groupId === group.id)
  const rows = new Map(
    group.members.map((member) => [
      member.entryId,
      { entryId: member.entryId, played: 0, won: 0, lost: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0 },
    ]),
  )
  for (const match of own) {
    if (!isDone(match) || !match.entryA || !match.entryB) continue
    const a = rows.get(match.entryA)
    const b = rows.get(match.entryB)
    if (!a || !b) continue
    a.played++
    b.played++
    if (match.winner === match.entryA) {
      a.won++
      b.lost++
    } else if (match.winner === match.entryB) {
      b.won++
      a.lost++
    }
    count(a, match.sets, 'a')
    count(b, match.sets, 'b')
  }
  // Level on wins, in draw order (stable sorts keep it).
  const byWins = new Map<number, StandingRow[]>()
  for (const row of rows.values()) byWins.set(row.won, [...(byWins.get(row.won) ?? []), row])
  const tied: string[][] = []
  const ordered = [...byWins.entries()]
    .sort((a, b) => b[0] - a[0])
    .flatMap(([, level]) => breakTie(level, own, tied))
  return { rows: ordered, complete: own.length > 0 && own.every(isDone), tied }
}

// The places that send a pair on: the qualifiers (never more than the group's size minus one), or every place when
// everyone plays everyone (the 1st is the champion).
export function decisivePlaces(category: { format: CategoryFormat; qualifiers: number }, groupSize: number): number {
  return category.format === 'round_robin' ? groupSize : Math.min(category.qualifiers, groupSize - 1)
}

// The ties that touch one of those places.
export function blockingTies(standings: GroupStandings, places: number): string[][] {
  return standings.tied.filter((level) =>
    level.some((entryId) => standings.rows.findIndex((row) => row.entryId === entryId) < places),
  )
}

// The order close_championship_group takes, when the group is complete and nothing level decides a place.
export function closingOrder(group: FixtureGroup, matches: FixtureMatch[], places: number): ClosingOrder {
  const standings = groupStandings(group, matches)
  if (!standings.complete) return { ok: false, reason: 'incomplete', tied: [] }
  const tied = blockingTies(standings, places)
  if (tied.length > 0) return { ok: false, reason: 'tied', tied }
  return { ok: true, order: standings.rows.map((row) => row.entryId) }
}

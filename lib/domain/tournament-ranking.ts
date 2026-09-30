import type { TournamentEntry, TournamentGame } from './tournaments'

export type RankingRow = {
  entryId: string
  name: string
  position: number
  points: number
  played: number
  won: number
  diff: number
}

// Team B's points: what is left of the game (the database stores only team A's).
export function scoreB(scoreA: number, pointsPerGame: number): number {
  return pointsPerGame - scoreA
}

// Design: points, then games won, then difference. Ties on all three share the position; the name
// only keeps the order stable. Games without a result do not count yet.
export function ranking(
  entries: Pick<TournamentEntry, 'id' | 'name'>[],
  games: TournamentGame[],
  pointsPerGame: number,
): RankingRow[] {
  const rows = new Map(
    entries.map((entry) => [entry.id, { entryId: entry.id, name: entry.name, position: 0, points: 0, played: 0, won: 0, diff: 0 }]),
  )
  const add = (team: [string, string], own: number, other: number) => {
    for (const id of team) {
      const row = rows.get(id)
      if (!row) continue
      row.points += own
      row.played += 1
      row.won += own > other ? 1 : 0
      row.diff += own - other
    }
  }
  for (const game of games) {
    if (game.scoreA === null) continue
    const b = scoreB(game.scoreA, pointsPerGame)
    add(game.teamA, game.scoreA, b)
    add(game.teamB, b, game.scoreA)
  }

  const sorted = [...rows.values()].sort(
    (a, b) => b.points - a.points || b.won - a.won || b.diff - a.diff || a.name.localeCompare(b.name, 'es'),
  )
  sorted.forEach((row, index) => {
    const previous = sorted[index - 1]
    const tied = previous && previous.points === row.points && previous.won === row.won && previous.diff === row.diff
    row.position = tied ? previous.position : index + 1
  })
  return sorted
}

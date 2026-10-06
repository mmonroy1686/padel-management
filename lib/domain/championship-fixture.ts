// The draw and the matches of a championship as the screens read them (supabase/migrations/20261007*): groups
// with their pairs in draw order, matches with their court, start, state and sets. A side not known yet says
// where it comes from: a group's place or the winner of a match.

export const MATCH_STATUSES = ['scheduled', 'playing', 'finished', 'walkover'] as const
export type MatchStatus = (typeof MATCH_STATUSES)[number]
export type MatchStage = 'group' | 'knockout'
export type MatchSource = { kind: 'group'; groupId: string; place: number } | { kind: 'winner'; matchId: string }
export type MatchSet = { a: number; b: number; superTiebreak: boolean }
export type FixtureMatch = {
  id: string
  categoryId: string
  stage: MatchStage
  groupId: string | null
  // Knockout: 1 = final, 2 = semifinals, 4 = quarterfinals...; position goes from 1 to round.
  round: number | null
  position: number | null
  entryA: string | null
  entryB: string | null
  sourceA: MatchSource | null
  sourceB: MatchSource | null
  courtId: string | null
  startsAt: Date | null
  endsAt: Date | null
  pinned: boolean
  status: MatchStatus
  winner: string | null
  // W.O.: the pair that did not show up.
  absent: string | null
  sets: MatchSet[]
}
export type GroupMember = { entryId: string; drawPosition: number; place: number | null }
export type FixtureGroup = { id: string; categoryId: string; name: string; sortOrder: number; members: GroupMember[] }
export type Fixture = { groups: FixtureGroup[]; matches: FixtureMatch[] }

export const EMPTY_FIXTURE: Fixture = { groups: [], matches: [] }

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  scheduled: 'Programado',
  playing: 'En juego',
  finished: 'Terminado',
  walkover: 'W.O.',
}

// What lib/data/championship-fixture.ts and public_championship return. If supabase-js infers a slightly
// different shape for the embeds, adjust these types to match; never cast the query result.
export type SetRow = { set_number: number; games_a: number; games_b: number; super_tiebreak: boolean }
export type MatchRow = {
  id: string
  category_id: string
  stage: MatchStage
  group_id: string | null
  round: number | null
  bracket_position: number | null
  entry_a_id: string | null
  entry_b_id: string | null
  source_a: unknown
  source_b: unknown
  court_id: string | null
  starts_at: string | null
  ends_at: string | null
  pinned: boolean
  status: MatchStatus
  winner_entry_id: string | null
  walkover_entry_id: string | null
  sets: SetRow[]
}
export type GroupRow = {
  id: string
  category_id: string
  name: string
  sort_order: number
  members: { entry_id: string; draw_position: number; place: number | null }[]
}

const ROUND_NAMES: Record<number, string> = { 1: 'Final', 2: 'Semifinal', 4: 'Cuartos de final', 8: 'Octavos de final' }
const ROUND_CODES: Record<number, string> = { 2: 'SF', 4: 'CF', 8: 'OF' }

export function roundName(round: number): string {
  return ROUND_NAMES[round] ?? `Ronda de ${round * 2}`
}

// "Final", "Semifinal 1", "Cuartos de final 3".
export function knockoutLabel(round: number, position: number): string {
  return round === 1 ? 'Final' : `${roundName(round)} ${position}`
}

// "Final", "SF1", "CF3": how a side waiting for a winner names the match ("Ganador SF1").
export function knockoutCode(round: number, position: number): string {
  return round === 1 ? 'Final' : `${ROUND_CODES[round] ?? `R${round * 2}-`}${position}`
}

// {"group": id, "place": 1} or {"winner_of": id}; anything else reads as null.
export function readSource(value: unknown): MatchSource | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (typeof record.winner_of === 'string') return { kind: 'winner', matchId: record.winner_of }
  if (typeof record.group === 'string' && typeof record.place === 'number') {
    return { kind: 'group', groupId: record.group, place: record.place }
  }
  return null
}

function toMatch(row: MatchRow): FixtureMatch {
  return {
    id: row.id,
    categoryId: row.category_id,
    stage: row.stage,
    groupId: row.group_id,
    round: row.round,
    position: row.bracket_position,
    entryA: row.entry_a_id,
    entryB: row.entry_b_id,
    sourceA: readSource(row.source_a),
    sourceB: readSource(row.source_b),
    courtId: row.court_id,
    startsAt: row.starts_at ? new Date(row.starts_at) : null,
    endsAt: row.ends_at ? new Date(row.ends_at) : null,
    pinned: row.pinned,
    status: row.status,
    winner: row.winner_entry_id,
    absent: row.walkover_entry_id,
    sets: [...row.sets]
      .sort((a, b) => a.set_number - b.set_number)
      .map((item) => ({ a: item.games_a, b: item.games_b, superTiebreak: item.super_tiebreak })),
  }
}

// Groups in their order; matches by category, groups before the bracket, the first rounds first.
export function toFixture(groups: GroupRow[], matches: MatchRow[]): Fixture {
  const groupOrder = new Map(groups.map((group) => [group.id, group.sort_order]))
  return {
    groups: groups
      .map((row) => ({
        id: row.id,
        categoryId: row.category_id,
        name: row.name,
        sortOrder: row.sort_order,
        members: [...row.members]
          .sort((a, b) => a.draw_position - b.draw_position)
          .map((member) => ({ entryId: member.entry_id, drawPosition: member.draw_position, place: member.place })),
      }))
      .sort((a, b) => a.categoryId.localeCompare(b.categoryId) || a.sortOrder - b.sortOrder),
    matches: matches
      .map(toMatch)
      .sort(
        (a, b) =>
          a.categoryId.localeCompare(b.categoryId) ||
          (a.stage === 'group' ? 0 : 1) - (b.stage === 'group' ? 0 : 1) ||
          (groupOrder.get(a.groupId ?? '') ?? 0) - (groupOrder.get(b.groupId ?? '') ?? 0) ||
          (b.round ?? 0) - (a.round ?? 0) ||
          (a.position ?? 0) - (b.position ?? 0) ||
          a.id.localeCompare(b.id),
      ),
  }
}

export function isDone(match: Pick<FixtureMatch, 'status'>): boolean {
  return match.status === 'finished' || match.status === 'walkover'
}

// "Zona A" or "Semifinal 1".
export function matchName(fixture: Fixture, match: FixtureMatch): string {
  if (match.stage === 'group') return fixture.groups.find((group) => group.id === match.groupId)?.name ?? 'Zona'
  return knockoutLabel(match.round ?? 1, match.position ?? 1)
}

// The pair, or where it comes from: "1° Zona A", "Ganador SF1".
export function sideName(
  fixture: Fixture,
  match: FixtureMatch,
  side: 'a' | 'b',
  entryName: (entryId: string) => string,
): string {
  const entryId = side === 'a' ? match.entryA : match.entryB
  if (entryId) return entryName(entryId)
  const source = side === 'a' ? match.sourceA : match.sourceB
  if (source?.kind === 'group') {
    return `${source.place}° ${fixture.groups.find((group) => group.id === source.groupId)?.name ?? 'Zona'}`
  }
  if (source?.kind === 'winner') {
    const feeder = fixture.matches.find((item) => item.id === source.matchId)
    return feeder ? `Ganador ${knockoutCode(feeder.round ?? 1, feeder.position ?? 1)}` : 'A definir'
  }
  return 'A definir'
}

// "6-4 3-6 10-8", "W.O." or null before any result.
export function scoreText(match: Pick<FixtureMatch, 'status' | 'sets'>): string | null {
  if (match.status === 'walkover') return 'W.O.'
  if (match.sets.length === 0) return null
  return match.sets.map((item) => `${item.a}-${item.b}`).join(' ')
}

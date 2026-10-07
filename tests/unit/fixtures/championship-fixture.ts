import type { FixtureGroup, FixtureMatch, GroupMember, MatchSet } from '@/lib/domain/championship-fixture'

// A group match of '6ta Libre' (k1) in Zona A (g1): e1 against e2, without a court yet.
export function makeMatch(overrides: Partial<FixtureMatch> = {}): FixtureMatch {
  return {
    id: 'm1',
    categoryId: 'k1',
    stage: 'group',
    groupId: 'g1',
    round: null,
    position: null,
    entryA: 'e1',
    entryB: 'e2',
    sourceA: null,
    sourceB: null,
    courtId: null,
    startsAt: null,
    endsAt: null,
    pinned: false,
    status: 'scheduled',
    winner: null,
    absent: null,
    sets: [],
    ...overrides,
  }
}

// Zona A of k1, with no pairs unless given.
export function makeGroup(overrides: Partial<FixtureGroup> = {}): FixtureGroup {
  return { id: 'g1', categoryId: 'k1', name: 'Zona A', sortOrder: 0, members: [], ...overrides }
}

export function members(entryIds: string[]): GroupMember[] {
  return entryIds.map((entryId, index) => ({ entryId, drawPosition: index + 1, place: null }))
}

export function set(a: number, b: number, superTiebreak = false, inProgress = false): MatchSet {
  return { a, b, superTiebreak, inProgress }
}

// A match of Zona A already played: side a or b wins, 6-3 6-3 unless other sets are given.
export function played(id: string, entryA: string, entryB: string, winner: 'a' | 'b', sets?: MatchSet[]): FixtureMatch {
  return makeMatch({
    id,
    entryA,
    entryB,
    status: 'finished',
    winner: winner === 'a' ? entryA : entryB,
    sets: sets ?? (winner === 'a' ? [set(6, 3), set(6, 3)] : [set(3, 6), set(3, 6)]),
  })
}

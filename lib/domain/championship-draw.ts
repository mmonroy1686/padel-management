import { activeEntries, openCategories, type CategoryFormat, type Championship } from './championships'

// The draw of a championship (design: "Sorteo"): groups of 3 or 4 by level with one seed each, and the bracket of
// the qualifiers (or of every pair, by direct knockout). Pure and deterministic: the same seed gives the same draw.
// A bye is no match: the seed that gets it goes straight into the next round. The Server Action sends the result
// to save_championship_draw, which checks it again.

export type DrawEntry = { id: string; level1: number; level2: number; seed: number | null; createdAt: Date }
export type DrawCategory = {
  id: string
  name: string
  format: CategoryFormat
  groupSize: number
  qualifiers: number
  entries: DrawEntry[]
}
export type DrawSource = { group: string; place: number } | { winnerOf: string }
export type DrawGroup = { key: string; name: string; entryIds: string[] }
export type DrawMatch = {
  key: string
  stage: 'group' | 'knockout'
  groupKey: string | null
  round: number | null
  position: number | null
  entryA: string | null
  entryB: string | null
  sourceA: DrawSource | null
  sourceB: DrawSource | null
}
export type CategoryDraw = { categoryId: string; groups: DrawGroup[]; matches: DrawMatch[] }
export type DrawResult = { ok: true; draw: CategoryDraw } | { ok: false; message: string }
export type ChampionshipDraw = { ok: true; draws: CategoryDraw[] } | { ok: false; message: string }

type Qualifier = { entryId: string | null; source: DrawSource | null; groupKey: string | null }
type Feeder = { match: string } | { qualifier: Qualifier }

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

// A small PRNG (mulberry32): the same seed, the same numbers.
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashText(text: string): number {
  let hash = 2166136261
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items]
  for (let index = out.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    ;[out[index], out[other]] = [out[other], out[index]]
  }
  return out
}

// Strongest first: the organizer's seeds (1 first), then the lowest sum of declared categories, then the oldest
// sign-up.
export function seedOrder<T extends DrawEntry>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    if (a.seed !== b.seed) {
      if (a.seed === null) return 1
      if (b.seed === null) return -1
      return a.seed - b.seed
    }
    return (
      a.level1 + a.level2 - (b.level1 + b.level2) ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.id.localeCompare(b.id)
    )
  })
}

// Groups of 3 or 4 (the category's size), combined when the pairs do not split evenly (10 = 3 + 3 + 4); fewer
// than 6 pairs play in one group.
export function groupSizes(count: number, size: number): number[] {
  if (count < 6) return [count]
  if (size === 4) {
    const groups = Math.ceil(count / 4)
    const threes = groups * 4 - count
    return [...Array<number>(threes).fill(3), ...Array<number>(groups - threes).fill(4)]
  }
  const groups = Math.floor(count / 3)
  const fours = count - groups * 3
  return [...Array<number>(groups - fours).fill(3), ...Array<number>(fours).fill(4)]
}

// Every pair of a group once (circle method): [[0, 3], [1, 2], [0, 2], ...] by draw position.
export function roundRobinPairs(count: number): [number, number][] {
  const slots: (number | null)[] = Array.from({ length: count }, (_, index) => index)
  if (count % 2 === 1) slots.push(null)
  const size = slots.length
  const pairs: [number, number][] = []
  for (let round = 0; round < size - 1; round++) {
    for (let index = 0; index < size / 2; index++) {
      const a = slots[index]
      const b = slots[size - 1 - index]
      if (a !== null && b !== null) pairs.push(a < b ? [a, b] : [b, a])
    }
    slots.splice(1, 0, ...slots.splice(size - 1, 1))
  }
  return pairs
}

// The seeds of a bracket in the order of its first round: 1 against 8, 4 against 5... (1 and 2 meet in the final).
export function bracketOrder(size: number): number[] {
  let order = [1]
  while (order.length < size) {
    const next = order.length * 2 + 1
    order = order.flatMap((seed) => [seed, next - seed])
  }
  return order
}

// The seeds go one per group in order; the rest, by level in pots of one pair per open group, each pot shuffled
// with the seed and laid in a snake.
function assignGroups(ordered: DrawEntry[], sizes: number[], random: () => number): string[][] {
  const groups: string[][] = sizes.map(() => [])
  ordered.slice(0, sizes.length).forEach((entry, index) => groups[index].push(entry.id))
  let rest = ordered.slice(sizes.length)
  let forward = false
  while (rest.length > 0) {
    const open = sizes.map((_, index) => index).filter((index) => groups[index].length < sizes[index])
    const order = forward ? open : [...open].reverse()
    const pot = shuffle(rest.slice(0, order.length), random)
    pot.forEach((entry, index) => groups[order[index]].push(entry.id))
    rest = rest.slice(order.length)
    forward = !forward
  }
  return groups
}

function sameGroup(a: Qualifier, b: Qualifier): boolean {
  return a.groupKey !== null && a.groupKey === b.groupKey
}

// Two of the same group never meet in the first round: the lower seed swaps with another match's.
function avoidSameGroup(pairs: [number, number][], qualifiers: Qualifier[]): void {
  const count = qualifiers.length
  const at = (seed: number) => qualifiers[seed - 1]
  for (const pair of pairs) {
    if (pair[1] > count || !sameGroup(at(pair[0]), at(pair[1]))) continue
    const other = pairs.find(
      (candidate) =>
        candidate !== pair &&
        candidate[1] <= count &&
        !sameGroup(at(pair[0]), at(candidate[1])) &&
        !sameGroup(at(candidate[0]), at(pair[1])),
    )
    if (other) [pair[1], other[1]] = [other[1], pair[1]]
  }
}

function side(feeder: Feeder): { entry: string | null; source: DrawSource | null } {
  if ('match' in feeder) return { entry: null, source: { winnerOf: feeder.match } }
  return { entry: feeder.qualifier.entryId, source: feeder.qualifier.source }
}

function knockoutMatch(round: number, position: number, a: Feeder, b: Feeder): DrawMatch {
  const sideA = side(a)
  const sideB = side(b)
  return {
    key: `K${round}-${position}`,
    stage: 'knockout',
    groupKey: null,
    round,
    position,
    entryA: sideA.entry,
    entryB: sideB.entry,
    sourceA: sideA.source,
    sourceB: sideB.source,
  }
}

// The bracket of the power of 2 that holds the qualifiers (in seed order); a bye sends its seed to the next round.
function buildBracket(qualifiers: Qualifier[]): DrawMatch[] {
  const count = qualifiers.length
  if (count < 2) return []
  let size = 2
  while (size < count) size *= 2
  const order = bracketOrder(size)
  const pairs: [number, number][] = []
  for (let index = 0; index < size; index += 2) pairs.push([order[index], order[index + 1]])
  avoidSameGroup(pairs, qualifiers)
  const matches: DrawMatch[] = []
  const firstRound = size / 2
  let feeders: Feeder[] = pairs.map(([a, b], index) => {
    const first: Feeder = { qualifier: qualifiers[a - 1] }
    if (b > count) return first
    const match = knockoutMatch(firstRound, index + 1, first, { qualifier: qualifiers[b - 1] })
    matches.push(match)
    return { match: match.key }
  })
  for (let round = firstRound / 2; round >= 1; round /= 2) {
    const next: Feeder[] = []
    for (let position = 1; position <= round; position++) {
      const match = knockoutMatch(round, position, feeders[2 * position - 2], feeders[2 * position - 1])
      matches.push(match)
      next.push({ match: match.key })
    }
    feeders = next
  }
  return matches
}

export function drawCategory(category: DrawCategory, seed: number): DrawResult {
  if (category.entries.length < 2) return { ok: false, message: 'Hacen falta al menos 2 parejas para sortear.' }
  const ordered = seedOrder(category.entries)
  if (category.format === 'knockout') {
    const qualifiers = ordered.map((entry) => ({ entryId: entry.id, source: null, groupKey: null }))
    return { ok: true, draw: { categoryId: category.id, groups: [], matches: buildBracket(qualifiers) } }
  }
  const sizes = category.format === 'round_robin' ? [ordered.length] : groupSizes(ordered.length, category.groupSize)
  const random = seededRandom((seed ^ hashText(category.id)) >>> 0)
  const groups: DrawGroup[] = assignGroups(ordered, sizes, random).map((entryIds, index) => ({
    key: LETTERS[index],
    name: category.format === 'round_robin' ? 'Zona única' : `Zona ${LETTERS[index]}`,
    entryIds,
  }))
  const matches: DrawMatch[] = groups.flatMap((group) =>
    roundRobinPairs(group.entryIds.length).map(([a, b], index) => ({
      key: `${group.key}${index + 1}`,
      stage: 'group' as const,
      groupKey: group.key,
      round: null,
      position: null,
      entryA: group.entryIds[a],
      entryB: group.entryIds[b],
      sourceA: null,
      sourceB: null,
    })),
  )
  if (category.format === 'groups_knockout') {
    // Every group's 1st (A, B, ...), then every 2nd...; never more than a group's size minus one.
    const qualifiers: Qualifier[] = []
    for (let place = 1; place <= category.qualifiers; place++) {
      for (const group of groups) {
        if (place < group.entryIds.length) {
          qualifiers.push({ entryId: null, source: { group: group.key, place }, groupKey: group.key })
        }
      }
    }
    matches.push(...buildBracket(qualifiers))
  }
  return { ok: true, draw: { categoryId: category.id, groups, matches } }
}

export function drawChampionship(categories: DrawCategory[], seed: number): ChampionshipDraw {
  const draws: CategoryDraw[] = []
  for (const category of categories) {
    const result = drawCategory(category, seed)
    if (!result.ok) return { ok: false, message: `${category.name}: ${result.message}` }
    draws.push(result.draw)
  }
  return { ok: true, draws }
}

// The open categories with their pairs with a place.
export function drawCategories(championship: Pick<Championship, 'categories'>): DrawCategory[] {
  return openCategories(championship).map((category) => ({
    id: category.id,
    name: category.name,
    format: category.format,
    groupSize: category.groupSize,
    qualifiers: category.qualifiers,
    entries: activeEntries(category).map((entry) => ({
      id: entry.id,
      level1: entry.level1,
      level2: entry.level2,
      seed: entry.seed,
      createdAt: entry.createdAt,
    })),
  }))
}

function sourcePayload(source: DrawSource | null) {
  if (!source) return null
  return 'winnerOf' in source ? { winner_of: source.winnerOf } : { group: source.group, place: source.place }
}

// What save_championship_draw takes.
export function drawPayload(draws: CategoryDraw[]) {
  return draws.map((draw) => ({
    category_id: draw.categoryId,
    groups: draw.groups.map((group) => ({ key: group.key, name: group.name, entry_ids: group.entryIds })),
    matches: draw.matches.map((match) => ({
      key: match.key,
      stage: match.stage,
      group: match.groupKey,
      round: match.round,
      position: match.position,
      entry_a: match.entryA,
      entry_b: match.entryB,
      source_a: sourcePayload(match.sourceA),
      source_b: sourcePayload(match.sourceB),
    })),
  }))
}

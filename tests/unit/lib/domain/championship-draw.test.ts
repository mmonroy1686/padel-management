import { describe, expect, it } from 'vitest'
import {
  bracketOrder,
  drawCategories,
  drawCategory,
  drawChampionship,
  drawPayload,
  groupSizes,
  roundRobinPairs,
  seedOrder,
  type CategoryDraw,
  type DrawCategory,
  type DrawEntry,
} from '@/lib/domain/championship-draw'
import { makeCategory, makeChampionship, makeEntry } from '../../fixtures/championships'

// count pairs, strongest first: e1 and e2 declare 3ª and 3ª, e3 and e4 4ª and 4ª..., one minute apart.
function entries(count: number): DrawEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `e${index + 1}`,
    level1: 3 + Math.floor(index / 2),
    level2: 3 + Math.floor(index / 2),
    seed: null,
    createdAt: new Date(Date.UTC(2026, 9, 1, 12, index)),
  }))
}

function category(overrides: Partial<DrawCategory> = {}): DrawCategory {
  return { id: 'k1', name: '6ta Libre', format: 'groups_knockout', groupSize: 4, qualifiers: 2, entries: entries(10), ...overrides }
}

function draw(overrides: Partial<DrawCategory> = {}, seed = 1): CategoryDraw {
  const result = drawCategory(category(overrides), seed)
  if (!result.ok) throw new Error(result.message)
  return result.draw
}

describe('groups', () => {
  it('makes groups of 3 or 4, combined when the pairs do not split evenly', () => {
    expect(groupSizes(10, 4)).toEqual([3, 3, 4])
    expect(groupSizes(10, 3)).toEqual([3, 3, 4])
    expect(groupSizes(12, 4)).toEqual([4, 4, 4])
    expect(groupSizes(7, 4)).toEqual([3, 4])
    expect(groupSizes(9, 4)).toEqual([3, 3, 3])
    expect(groupSizes(8, 3)).toEqual([4, 4])
    expect(groupSizes(5, 4)).toEqual([5])
  })

  it('plays every pair of a group once', () => {
    expect(roundRobinPairs(4)).toEqual([[0, 3], [1, 2], [0, 2], [1, 3], [0, 1], [2, 3]])
    expect(roundRobinPairs(3)).toEqual([[1, 2], [0, 2], [0, 1]])
  })
})

describe('seeds', () => {
  it('puts the organizer\'s seeds first, then the lowest sum of categories, then the oldest sign-up', () => {
    const list = entries(5).map((entry) =>
      entry.id === 'e3' ? { ...entry, seed: 2 } : entry.id === 'e5' ? { ...entry, seed: 1 } : entry,
    )
    expect(seedOrder(list).map((entry) => entry.id)).toEqual(['e5', 'e3', 'e1', 'e2', 'e4'])
  })

  it('puts one seed in each group, in order', () => {
    expect(draw().groups.map((group) => group.entryIds[0])).toEqual(['e1', 'e2', 'e3'])
    const seeded = entries(10).map((entry) => (entry.id === 'e10' ? { ...entry, seed: 1 } : entry))
    expect(draw({ entries: seeded }).groups.map((group) => group.entryIds[0])).toEqual(['e10', 'e1', 'e2'])
  })
})

describe('drawCategory', () => {
  it('draws 10 pairs into groups of 3, 3 and 4 and a bracket of 8 with byes for the best firsts', () => {
    const result = draw()
    expect(result.groups.map((group) => [group.name, group.entryIds.length])).toEqual([
      ['Zona A', 3],
      ['Zona B', 3],
      ['Zona C', 4],
    ])
    expect(result.groups.flatMap((group) => group.entryIds).sort()).toEqual(entries(10).map((entry) => entry.id).sort())
    expect(result.matches.filter((match) => match.stage === 'group')).toHaveLength(12)
    const knockout = result.matches.filter((match) => match.stage === 'knockout')
    expect(knockout.map((match) => match.key)).toEqual(['K4-2', 'K4-4', 'K2-1', 'K2-2', 'K1-1'])
    expect(knockout.find((match) => match.key === 'K2-1')?.sourceA).toEqual({ group: 'A', place: 1 })
    expect(knockout.find((match) => match.key === 'K2-2')?.sourceA).toEqual({ group: 'B', place: 1 })
    for (const match of knockout.filter((item) => item.round === 4)) {
      const groupA = match.sourceA && 'group' in match.sourceA ? match.sourceA.group : null
      const groupB = match.sourceB && 'group' in match.sourceB ? match.sourceB.group : null
      expect(groupA).not.toBe(groupB)
    }
    expect(knockout.find((match) => match.key === 'K1-1')).toMatchObject({
      sourceA: { winnerOf: 'K2-1' },
      sourceB: { winnerOf: 'K2-2' },
    })
  })

  it('gives the same draw for the same seed, and a new one for another seed', () => {
    expect(draw({}, 7)).toEqual(draw({}, 7))
    const groupings = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((seed) => JSON.stringify(draw({}, seed).groups)))
    expect(groupings.size).toBeGreaterThan(1)
  })

  it('draws a direct knockout with byes for the top seeds', () => {
    const result = draw({ format: 'knockout', entries: entries(6) })
    expect(result.groups).toEqual([])
    expect(result.matches.map((match) => match.key)).toEqual(['K4-2', 'K4-4', 'K2-1', 'K2-2', 'K1-1'])
    expect(result.matches.find((match) => match.key === 'K4-2')).toMatchObject({ entryA: 'e4', entryB: 'e5' })
    expect(result.matches.find((match) => match.key === 'K2-1')).toMatchObject({
      entryA: 'e1',
      sourceA: null,
      entryB: null,
      sourceB: { winnerOf: 'K4-2' },
    })
  })

  it('draws everyone against everyone in one group', () => {
    const result = draw({ format: 'round_robin', entries: entries(5) })
    expect(result.groups).toEqual([{ key: 'A', name: 'Zona única', entryIds: ['e1', 'e2', 'e3', 'e4', 'e5'] }])
    expect(result.matches).toHaveLength(10)
    expect(result.matches.every((match) => match.stage === 'group')).toBe(true)
  })

  it('plays a final between the 1st and the 2nd when there is only one group', () => {
    const result = draw({ entries: entries(4) })
    expect(result.groups).toHaveLength(1)
    expect(result.matches.filter((match) => match.stage === 'group')).toHaveLength(6)
    expect(result.matches.find((match) => match.stage === 'knockout')).toMatchObject({
      key: 'K1-1',
      round: 1,
      position: 1,
      sourceA: { group: 'A', place: 1 },
      sourceB: { group: 'A', place: 2 },
    })
  })

  it('needs 2 pairs', () => {
    expect(drawCategory(category({ entries: entries(1) }), 1)).toEqual({
      ok: false,
      message: 'Hacen falta al menos 2 parejas para sortear.',
    })
    expect(drawChampionship([category({ entries: entries(1) })], 1)).toEqual({
      ok: false,
      message: '6ta Libre: Hacen falta al menos 2 parejas para sortear.',
    })
  })
})

describe('bracketOrder', () => {
  it('keeps the top seeds apart until the end', () => {
    expect(bracketOrder(2)).toEqual([1, 2])
    expect(bracketOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6])
  })
})

describe('drawCategories and drawPayload', () => {
  it('draws the pairs with a place of the open categories', () => {
    const championship = makeChampionship({
      categories: [
        makeCategory({ entries: [makeEntry({ id: 'e1', seed: 1 }), makeEntry({ id: 'e2', status: 'waiting' })] }),
        makeCategory({ id: 'k2', name: '4ta', status: 'cancelled' }),
      ],
    })
    expect(drawCategories(championship)).toEqual([
      {
        id: 'k1',
        name: '6ta Libre',
        format: 'groups_knockout',
        groupSize: 4,
        qualifiers: 2,
        entries: [{ id: 'e1', level1: 5, level2: 6, seed: 1, createdAt: new Date('2026-10-06T12:00:00Z') }],
      },
    ])
  })

  it('sends the draw as save_championship_draw takes it', () => {
    const [payload] = drawPayload([draw({ entries: entries(4) })])
    expect(payload.category_id).toBe('k1')
    expect(payload.groups).toEqual([{ key: 'A', name: 'Zona A', entry_ids: ['e1', 'e2', 'e3', 'e4'] }])
    expect(payload.matches[0]).toEqual({
      key: 'A1',
      stage: 'group',
      group: 'A',
      round: null,
      position: null,
      entry_a: 'e1',
      entry_b: 'e4',
      source_a: null,
      source_b: null,
    })
    expect(payload.matches[6]).toEqual({
      key: 'K1-1',
      stage: 'knockout',
      group: null,
      round: 1,
      position: 1,
      entry_a: null,
      entry_b: null,
      source_a: { group: 'A', place: 1 },
      source_b: { group: 'A', place: 2 },
    })
  })
})

import { describe, expect, it } from 'vitest'
import { candidatesFor, demandOf, demandText, isStrong, propose, sideWarning } from '@/lib/domain/slot-planner'
import { candidate, strongRows } from '../../fixtures/assistant'
import { at, TIMEZONE } from '../../fixtures/grid'

describe('isStrong', () => {
  it('counts who played there twice or says she is usually free', () => {
    expect(isStrong(candidate('a', { times_played: 2, usually_free: false }))).toBe(true)
    expect(isStrong(candidate('b', { times_played: 1, usually_free: false }))).toBe(false)
    expect(isStrong(candidate('c', { times_played: 0, usually_free: true }))).toBe(true)
  })
})

describe('propose', () => {
  it('proposes one category when it fills a match on its own', () => {
    const rows = [...strongRows(4), candidate('six', { category: 6 })]
    expect(propose(rows)).toEqual({
      categoryMin: 5,
      categoryMax: 5,
      type: 'male',
      demand: 'medium',
      strong: 4,
      sideWarning: null,
    })
  })

  it('otherwise joins the two neighbouring categories with the most strong candidates', () => {
    const rows = [
      candidate('a', { category: 5 }),
      candidate('b', { category: 5, side: 'backhand' }),
      candidate('c', { category: 6 }),
      candidate('d', { category: 6, side: 'backhand' }),
      candidate('e', { category: 3 }),
      // Played there once: not strong, does not weigh.
      ...Array.from({ length: 5 }, (_, index) =>
        candidate(`w${index}`, { category: 8, usually_free: false, times_played: 1 }),
      ),
    ]
    expect(propose(rows)).toMatchObject({ categoryMin: 5, categoryMax: 6, strong: 4 })
  })

  it('breaks a tie by the score, then by the lower category', () => {
    const low = [candidate('a', { category: 3 }), candidate('b', { category: 3, side: 'backhand' })]
    const high = [
      candidate('c', { category: 6, score: 30 }),
      candidate('d', { category: 6, side: 'backhand', score: 30 }),
    ]
    expect(propose([...low, ...high])).toMatchObject({ categoryMin: 5, categoryMax: 6 })
    const even = [candidate('c', { category: 6 }), candidate('d', { category: 6, side: 'backhand' })]
    expect(propose([...low, ...even])).toMatchObject({ categoryMin: 2, categoryMax: 3 })
  })

  it("proposes a men's or women's match when four of one gender would play", () => {
    const women = Array.from({ length: 4 }, (_, index) =>
      candidate(`f${index}`, { gender: 'female', side: index % 2 ? 'backhand' : 'drive' }),
    )
    expect(propose([...women, candidate('m')])).toMatchObject({ type: 'female', strong: 4 })
    expect(propose([...strongRows(3), ...women.slice(0, 3)])).toMatchObject({ type: 'mixed', strong: 6, demand: 'high' })
    expect(propose([...strongRows(4), ...women])).toMatchObject({ type: 'mixed', strong: 8 })
  })

  it('warns when a side is short, counting those who play both', () => {
    const drives = Array.from({ length: 4 }, (_, index) => candidate(`d${index}`))
    expect(propose(drives)?.sideWarning).toBe('Pocos de revés')
    expect(
      propose([...drives.slice(0, 2), candidate('x', { side: 'both' }), candidate('y', { side: 'both' })])?.sideWarning,
    ).toBeNull()
  })

  it('has nothing to propose without strong candidates', () => {
    expect(propose([])).toBeNull()
    expect(propose([candidate('a', { usually_free: false, times_played: 1 })])).toBeNull()
  })
})

describe('sideWarning', () => {
  it('names the short side', () => {
    expect(sideWarning([candidate('a', { side: 'backhand' }), candidate('b', { side: 'backhand' })])).toBe('Pocos de drive')
    expect(sideWarning([candidate('a')])).toBe('Pocos de drive y de revés')
  })
})

describe('demand', () => {
  it('is high from 6 strong candidates and medium from 3', () => {
    expect([6, 5, 3, 2].map((strong) => demandOf(strong))).toEqual(['high', 'medium', 'medium', 'low'])
  })

  it('shows the count, with a flame when it is high', () => {
    const high = propose(strongRows(8))
    const medium = propose(strongRows(5))
    const low = propose(strongRows(2))
    expect(high && demandText(high)).toBe('🔥 8 posibles')
    expect(medium && demandText(medium)).toBe('5 posibles')
    expect(low && demandText(low)).toBeNull()
  })
})

describe('candidatesFor', () => {
  // Thursday 2026-10-01 at 20:00 (night).
  const context = { startsAt: at('20:00'), courtName: 'Cancha 2', timezone: TIMEZONE }
  const rows = [
    candidate('b', { display_name: 'Bruno', category: 6, side: 'backhand', times_played: 4, usually_free: false, score: 20 }),
    candidate('a', { display_name: 'Ana', gender: 'female', prefers_court: true, score: 28 }),
    candidate('h', { display_name: 'Hugo', category: 4 }),
  ]

  it('lists who fits the range and type, best first, with the reasons', () => {
    expect(candidatesFor(rows, { categoryMin: 5, categoryMax: 6, type: 'mixed' }, context)).toEqual([
      {
        playerId: 'a',
        name: 'Ana',
        score: 28,
        strong: true,
        chips: [
          { text: 'Suele estar libre los jueves de noche', hit: true },
          { text: '5ª, entra en 5ª/6ª', hit: false },
          { text: 'Prefiere la Cancha 2', hit: false },
        ],
      },
      {
        playerId: 'b',
        name: 'Bruno',
        score: 20,
        strong: true,
        chips: [
          { text: 'Jugó 4 veces los jueves 20:00', hit: true },
          { text: '6ª, entra en 5ª/6ª', hit: false },
        ],
      },
    ])
  })

  it('narrows with the choice', () => {
    expect(candidatesFor(rows, { categoryMin: 5, categoryMax: 6, type: 'male' }, context).map((row) => row.name)).toEqual(['Bruno'])
    expect(candidatesFor(rows, { categoryMin: 5, categoryMax: 5, type: 'mixed' }, context)[0].chips[1]).toEqual({
      text: '5ª categoría',
      hit: false,
    })
  })

  it('says one game in the singular and does not mark it', () => {
    const [once] = candidatesFor(
      [candidate('o', { times_played: 1, usually_free: false })],
      { categoryMin: 5, categoryMax: 5, type: 'mixed' },
      context,
    )
    expect(once.chips[0]).toEqual({ text: 'Jugó 1 vez los jueves 20:00', hit: false })
    expect(once.strong).toBe(false)
  })
})

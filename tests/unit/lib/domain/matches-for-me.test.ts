import { describe, expect, it } from 'vitest'
import { at, TIMEZONE } from '../../fixtures/grid'
import { BRUNO, CONTEXT, makeMatch } from '../../fixtures/matches'
import type { Habits } from '@/lib/domain/matches'
import { habitKey, matchesForMe } from '@/lib/domain/matches-for-me'

// 2026-10-01 is a Thursday (4); 20:00 is minute 1200 (night), 12:30 is still morning.
const NONE: Habits = { playedAt: new Map(), availability: new Set(), preferredCourtIds: new Set() }
const context = (habits: Partial<Habits>) => ({ ...CONTEXT, timezone: TIMEZONE, habits: { ...NONE, ...habits } })

describe('matchesForMe', () => {
  it('puts the usual time first, then being free, and adds the preferred court', () => {
    const usual = makeMatch({ id: 'usual' })
    const free = makeMatch({ id: 'free', startsAt: at('12:30'), endsAt: at('14:00'), preferredCourtId: 'court-2' })
    const result = matchesForMe([free, usual], BRUNO, context({
      playedAt: new Map([[habitKey(4, 1200), 3]]),
      availability: new Set(['4-morning']),
      preferredCourtIds: new Set(['court-1']),
    }))
    expect(result).toEqual([
      { match: usual, reasons: ['Tu horario de siempre', 'Tu cancha preferida'] },
      { match: free, reasons: ['Estás libre a esa hora'] },
    ])
  })

  it('leaves out matches he cannot join or has no reason to', () => {
    const forWomen = makeMatch({ id: 'women', type: 'female' })
    const noReason = makeMatch({ id: 'plain' })
    expect(matchesForMe([forWomen, noReason], BRUNO, context({ availability: new Set(['4-night']) }))).toEqual([
      { match: noReason, reasons: ['Estás libre a esa hora'] },
    ])
    expect(matchesForMe([noReason], BRUNO, context({}))).toEqual([])
  })

  it('shows at most two', () => {
    const matches = ['a', 'b', 'c'].map((id) => makeMatch({ id }))
    expect(matchesForMe(matches, BRUNO, context({ availability: new Set(['4-night']) }))).toHaveLength(2)
  })
})

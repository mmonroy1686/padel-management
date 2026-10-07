import { describe, expect, it } from 'vitest'
import { liveFinish } from '@/lib/domain/championship-live'
import type { MatchRules } from '@/lib/domain/championship-results'
import { set } from '../../fixtures/championship-fixture'

const OPEN: MatchRules = { thirdSet: 'super_tiebreak', timeLimit: null }
const TIMED: MatchRules = { thirdSet: 'super_tiebreak', timeLimit: 50 }

describe('liveFinish', () => {
  it('ends a decided match with its sets', () => {
    expect(liveFinish([set(6, 4), set(6, 3)], OPEN)).toEqual({
      sets: [
        [6, 4],
        [6, 3],
      ],
      label: 'Terminar partido con 6-4 6-3',
    })
    expect(liveFinish([set(6, 4), set(4, 6), set(10, 8, true)], OPEN)?.label).toBe('Terminar partido con 6-4 4-6 10-8')
  })

  it('waits while nobody won 2 sets', () => {
    expect(liveFinish([], OPEN)).toBeNull()
    expect(liveFinish([set(6, 4), set(3, 2, false, true)], OPEN)).toBeNull()
  })

  it('with a time limit ends the match as it stands, once that is a result', () => {
    expect(liveFinish([set(6, 4), set(3, 2, false, true)], TIMED)).toEqual({
      sets: [
        [6, 4],
        [3, 2],
      ],
      label: 'Terminar partido con 6-4 3-2',
    })
    expect(liveFinish([set(6, 4), set(0, 0, false, true)], TIMED)?.label).toBe('Terminar partido con 6-4')
    expect(liveFinish([set(6, 4), set(4, 6), set(0, 0, true, true)], TIMED)).toBeNull()
  })
})

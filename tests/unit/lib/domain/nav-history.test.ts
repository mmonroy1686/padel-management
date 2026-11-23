import { describe, expect, it } from 'vitest'
import { canGoBack, MAX_HISTORY, nextHistory, readHistory } from '@/lib/domain/nav-history'

describe('nextHistory', () => {
  it('adds each new screen', () => {
    expect(nextHistory([], '/club/inicio')).toEqual(['/club/inicio'])
    expect(nextHistory(['/club/inicio'], '/club/cobros')).toEqual(['/club/inicio', '/club/cobros'])
  })

  it('the same screen again (a refresh) changes nothing', () => {
    expect(nextHistory(['/club/inicio'], '/club/inicio')).toEqual(['/club/inicio'])
  })

  it('the screen before the last one is a step back', () => {
    expect(nextHistory(['/a', '/b', '/c'], '/b')).toEqual(['/a', '/b'])
  })

  it('keeps the last 50', () => {
    const long = Array.from({ length: MAX_HISTORY }, (_, index) => `/${index}`)
    expect(nextHistory(long, '/new')).toHaveLength(MAX_HISTORY)
    expect(nextHistory(long, '/new').at(-1)).toBe('/new')
  })
})

describe('canGoBack', () => {
  it('only after moving to another screen', () => {
    expect(canGoBack([])).toBe(false)
    expect(canGoBack(['/'])).toBe(false)
    expect(canGoBack(['/', '/torneos'])).toBe(true)
  })
})

describe('readHistory', () => {
  it('reads what was stored, or starts empty', () => {
    expect(readHistory('["/","/torneos"]')).toEqual(['/', '/torneos'])
    expect(readHistory(null)).toEqual([])
    expect(readHistory('not json')).toEqual([])
    expect(readHistory('[1,2]')).toEqual([])
  })
})

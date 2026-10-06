import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AutoRefresh } from '@/components/live/auto-refresh'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

describe('AutoRefresh', () => {
  beforeEach(() => {
    refresh.mockClear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reloads the page every few seconds while it is open', () => {
    const { unmount } = render(<AutoRefresh seconds={15} />)
    act(() => vi.advanceTimersByTime(14_999))
    expect(refresh).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(refresh).toHaveBeenCalledTimes(1)
    unmount()
    act(() => vi.advanceTimersByTime(30_000))
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})

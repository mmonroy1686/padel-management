import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveOccupancy } from '@/components/live/live-occupancy'

const mocks = vi.hoisted(() => {
  const handlers: Array<() => void> = []
  const channel = {
    on: vi.fn(),
    subscribe: vi.fn(),
  }
  channel.on.mockImplementation((_type: string, _filter: unknown, handler: () => void) => {
    handlers.push(handler)
    return channel
  })
  channel.subscribe.mockImplementation(() => channel)
  return { handlers, channel, createChannel: vi.fn(() => channel), removeChannel: vi.fn(), refresh: vi.fn() }
})

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ channel: mocks.createChannel, removeChannel: mocks.removeChannel }),
}))

describe('LiveOccupancy', () => {
  beforeEach(() => {
    mocks.handlers.length = 0
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('listens to new occupancies of its club and to any removal', () => {
    render(<LiveOccupancy clubId="club-1" />)
    expect(mocks.channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'court_occupancy', filter: 'club_id=eq.club-1' },
      expect.any(Function),
    )
    expect(mocks.channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'court_occupancy' },
      expect.any(Function),
    )
    expect(mocks.channel.subscribe).toHaveBeenCalled()
  })

  it('reloads the day once after a burst of changes', () => {
    render(<LiveOccupancy clubId="club-1" />)
    act(() => {
      for (const handler of mocks.handlers) handler()
      vi.advanceTimersByTime(300)
    })
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('stops listening when the screen goes away', () => {
    const { unmount } = render(<LiveOccupancy clubId="club-1" />)
    unmount()
    expect(mocks.removeChannel).toHaveBeenCalledWith(mocks.channel)
  })
})

import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveOccupancy } from '@/components/live/live-occupancy'

const mocks = vi.hoisted(() => {
  const handlers: Array<() => void> = []
  const calls: string[] = []
  const channel = {
    on: vi.fn(),
    subscribe: vi.fn(),
  }
  channel.on.mockImplementation((_type: string, _filter: unknown, handler: () => void) => {
    handlers.push(handler)
    return channel
  })
  channel.subscribe.mockImplementation(() => {
    calls.push('subscribe')
    return channel
  })
  const setAuth = vi.fn(async (token: string) => {
    calls.push(`setAuth ${token}`)
  })
  const getSession = vi.fn(async () => ({ data: { session: { access_token: 'user-token' } } }))
  return {
    handlers,
    calls,
    channel,
    setAuth,
    getSession,
    createChannel: vi.fn(() => channel),
    removeChannel: vi.fn(),
    refresh: vi.fn(),
  }
})

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getSession: mocks.getSession },
    realtime: { setAuth: mocks.setAuth },
    channel: mocks.createChannel,
    removeChannel: mocks.removeChannel,
  }),
}))

// Lets the effect's async start (session, then subscribe) finish.
async function settle() {
  await act(async () => {
    await vi.runAllTimersAsync()
  })
}

describe('LiveOccupancy', () => {
  beforeEach(() => {
    mocks.handlers.length = 0
    mocks.calls.length = 0
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('subscribes with the viewer\'s token, so RLS and column privileges apply', async () => {
    render(<LiveOccupancy clubId="club-1" />)
    await settle()
    expect(mocks.calls).toEqual(['setAuth user-token', 'subscribe'])
  })

  it('listens to occupancies, matches, spots, tournaments, day use passes and waits of its club', async () => {
    render(<LiveOccupancy clubId="club-1" />)
    await settle()
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
    expect(mocks.channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'open_matches', filter: 'club_id=eq.club-1' },
      expect.any(Function),
    )
    expect(mocks.channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'match_slots', filter: 'club_id=eq.club-1' },
      expect.any(Function),
    )
    for (const table of ['tournaments', 'tournament_entries', 'tournament_games', 'day_use_passes', 'slot_waits']) {
      expect(mocks.channel.on).toHaveBeenCalledWith(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: 'club_id=eq.club-1' },
        expect.any(Function),
      )
    }
  })

  it('reloads the day once after a burst of changes', async () => {
    render(<LiveOccupancy clubId="club-1" />)
    await settle()
    act(() => {
      for (const handler of mocks.handlers) handler()
      vi.advanceTimersByTime(300)
    })
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('stops listening when the screen goes away', async () => {
    const { unmount } = render(<LiveOccupancy clubId="club-1" />)
    await settle()
    unmount()
    expect(mocks.removeChannel).toHaveBeenCalledWith(mocks.channel)
  })

  it('does not subscribe if the screen went away before the session loaded', async () => {
    const { unmount } = render(<LiveOccupancy clubId="club-1" />)
    unmount()
    await settle()
    expect(mocks.channel.subscribe).not.toHaveBeenCalled()
  })
})


describe('LiveOccupancy and the championships', () => {
  beforeEach(() => {
    mocks.handlers.length = 0
    mocks.calls.length = 0
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('listens to the matches of the championships and their sets', async () => {
    render(<LiveOccupancy clubId="club-1" />)
    await settle()
    for (const table of ['championship_matches', 'championship_match_sets']) {
      expect(mocks.channel.on).toHaveBeenCalledWith(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: 'club_id=eq.club-1' },
        expect.any(Function),
      )
    }
  })
})

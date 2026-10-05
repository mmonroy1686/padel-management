import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveNotifications } from '@/components/live/live-notifications'

const mocks = vi.hoisted(() => {
  const handlers: Array<() => void> = []
  const calls: string[] = []
  const channel = { on: vi.fn(), subscribe: vi.fn() }
  channel.on.mockImplementation((_type: string, _filter: unknown, handler: () => void) => {
    handlers.push(handler)
    return channel
  })
  channel.subscribe.mockImplementation(() => {
    calls.push('subscribe')
    return channel
  })
  return {
    handlers,
    calls,
    channel,
    setAuth: vi.fn(async (token: string) => {
      calls.push(`setAuth ${token}`)
    }),
    getSession: vi.fn(async () => ({ data: { session: { access_token: 'user-token' } } })),
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

async function settle() {
  await act(async () => {
    await vi.runAllTimersAsync()
  })
}

describe('LiveNotifications', () => {
  beforeEach(() => {
    mocks.handlers.length = 0
    mocks.calls.length = 0
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('listens to the viewer\'s new avisos with her token', async () => {
    render(<LiveNotifications userId="u1" />)
    await settle()
    expect(mocks.calls).toEqual(['setAuth user-token', 'subscribe'])
    expect(mocks.channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.u1' },
      expect.any(Function),
    )
  })

  it('reloads the screen once when avisos arrive', async () => {
    render(<LiveNotifications userId="u1" />)
    await settle()
    act(() => {
      mocks.handlers[0]()
      mocks.handlers[0]()
      vi.advanceTimersByTime(300)
    })
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('stops listening when it goes away', async () => {
    const { unmount } = render(<LiveNotifications userId="u1" />)
    await settle()
    unmount()
    expect(mocks.removeChannel).toHaveBeenCalledWith(mocks.channel)
  })
})

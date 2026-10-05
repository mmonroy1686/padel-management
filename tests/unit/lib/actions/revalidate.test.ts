import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  after: vi.fn<(callback: () => Promise<void>) => void>(),
  flushOutbox: vi.fn<() => Promise<unknown>>(async () => ({ sent: 0, failed: 0, skipped: 0 })),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/server', () => ({ after: mocks.after }))
vi.mock('@/lib/notify/outbox', () => ({ flushOutbox: mocks.flushOutbox }))

const { revalidateBookings } = await import('@/lib/actions/revalidate')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('revalidateBookings', () => {
  it('refreshes every screen and mails the queued avisos once the response is out', async () => {
    revalidateBookings()
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/', 'layout')
    expect(mocks.after).toHaveBeenCalledTimes(1)
    expect(mocks.flushOutbox).not.toHaveBeenCalled()
    await mocks.after.mock.calls[0][0]()
    expect(mocks.flushOutbox).toHaveBeenCalledTimes(1)
  })

  it('never lets a failed mail run break the write', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.flushOutbox.mockRejectedValueOnce(new Error('sin red'))
    revalidateBookings()
    await expect(mocks.after.mock.calls[0][0]()).resolves.toBeUndefined()
  })
})

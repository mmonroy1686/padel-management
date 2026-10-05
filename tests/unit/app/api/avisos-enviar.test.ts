// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const flushOutbox = vi.fn(async () => ({ sent: 1, failed: 0, skipped: 2 }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/notify/outbox', () => ({ flushOutbox: () => flushOutbox() }))

const { POST } = await import('@/app/api/avisos/enviar/route')

function request(authorization?: string): Request {
  return new Request('http://localhost:3000/api/avisos/enviar', {
    method: 'POST',
    headers: authorization ? { authorization } : {},
  })
}

beforeEach(() => {
  flushOutbox.mockClear()
  vi.stubEnv('NOTIFY_SECRET', 'secreto-del-cron')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('POST /api/avisos/enviar', () => {
  it('mails the pending avisos when the cron brings the secret', async () => {
    const response = await POST(request('Bearer secreto-del-cron'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ sent: 1, failed: 0, skipped: 2 })
    expect(flushOutbox).toHaveBeenCalledTimes(1)
  })

  it('rejects a call without the secret or with another one', async () => {
    expect((await POST(request())).status).toBe(401)
    expect((await POST(request('Bearer otro'))).status).toBe(401)
    expect((await POST(request('secreto-del-cron'))).status).toBe(401)
    expect(flushOutbox).not.toHaveBeenCalled()
  })

  it('rejects everything while the server has no secret', async () => {
    vi.stubEnv('NOTIFY_SECRET', '')
    expect((await POST(request('Bearer '))).status).toBe(401)
    expect(flushOutbox).not.toHaveBeenCalled()
  })
})

// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ admin: null as unknown, sender: null as unknown }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => mocks.admin }))
vi.mock('@/lib/notify/email', () => ({ emailSenderFromEnv: () => mocks.sender }))

const { flushOutbox } = await import('@/lib/notify/outbox')

// A hold far in the future, so the run never finds it stale.
const ROW = {
  notification_id: 'n1',
  kind: 'slot_held',
  data: { court_name: 'Cancha 2', starts_at: '2099-10-03T22:00:00Z', expires_at: '2099-10-03T20:42:00Z' },
  link: '/',
  email: 'ana@test.local',
  player_name: 'Ana',
  club_name: 'Rustic Pádel',
  club_timezone: 'America/Montevideo',
  club_logo_path: null,
}

beforeEach(() => {
  mocks.admin = null
  mocks.sender = null
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://db.test')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'publishable')
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://rustic.test')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('flushOutbox', () => {
  it('does nothing without the service role key', async () => {
    expect(await flushOutbox()).toEqual({ sent: 0, failed: 0, skipped: 0 })
  })

  it('claims through the database, mails each aviso and marks it', async () => {
    const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: null }>>(
      async (name) => ({ data: name === 'claim_notification_emails' ? [ROW] : null, error: null }),
    )
    const sender = vi.fn<(message: { to: string; text: string }) => Promise<void>>(async () => {})
    mocks.admin = { rpc }
    mocks.sender = sender
    expect(await flushOutbox()).toEqual({ sent: 1, failed: 0, skipped: 0 })
    expect(rpc).toHaveBeenCalledWith('claim_notification_emails', { p_limit: 20 })
    expect(sender).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ana@test.local', text: expect.stringContaining('https://rustic.test/') }),
    )
    expect(rpc).toHaveBeenCalledWith('finish_notification_email', { p_id: 'n1', p_status: 'sent' })
  })
})

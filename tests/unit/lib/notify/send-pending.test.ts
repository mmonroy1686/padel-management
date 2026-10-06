// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EmailSender } from '@/lib/notify/email'
import type { PendingEmail } from '@/lib/notify/messages'
import { sendPending, type OutboxStore } from '@/lib/notify/send-pending'

// 20:30 UTC: the hold (until 20:42 UTC) is still on; the slot starts at 22:00 UTC.
const NOW = new Date('2026-10-03T20:30:00Z')
const OPTIONS = { siteUrl: 'https://rustic.test', supabaseUrl: 'https://db.test', now: NOW }

function pending(id: string, overrides: Partial<PendingEmail> = {}): PendingEmail {
  return {
    id,
    kind: 'slot_held',
    data: { court_name: 'Cancha 2', starts_at: '2026-10-03T22:00:00Z', expires_at: '2026-10-03T20:42:00Z' },
    link: '/',
    email: `${id}@test.local`,
    playerName: 'Ana',
    clubName: 'Rustic Pádel',
    clubTimezone: 'America/Montevideo',
    clubLogoPath: null,
    ...overrides,
  }
}

function fakeStore(items: PendingEmail[]) {
  const claim = vi.fn<OutboxStore['claim']>(async () => items)
  const finish = vi.fn<OutboxStore['finish']>(async () => {})
  return { store: { claim, finish }, claim, finish }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('sendPending', () => {
  it('mails each claimed aviso and marks it sent', async () => {
    const { store, claim, finish } = fakeStore([pending('n1'), pending('n2')])
    const sender = vi.fn<EmailSender>(async () => {})
    expect(await sendPending(store, sender, OPTIONS)).toEqual({ sent: 2, failed: 0, skipped: 0 })
    expect(claim).toHaveBeenCalledWith(20)
    expect(sender.mock.calls[0][0]).toMatchObject({ to: 'n1@test.local', subject: 'Se liberó tu turno: sáb 3, 19:00, Cancha 2' })
    expect(finish.mock.calls).toEqual([
      ['n1', 'sent'],
      ['n2', 'sent'],
    ])
  })

  it('marks a mail that did not go out as failed, so it is retried', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { store, finish } = fakeStore([pending('n1'), pending('n2')])
    const sender = vi.fn<EmailSender>(async (message) => {
      if (message.to === 'n1@test.local') throw new Error('Resend respondió 500')
    })
    expect(await sendPending(store, sender, OPTIONS)).toEqual({ sent: 1, failed: 1, skipped: 0 })
    expect(finish.mock.calls).toEqual([
      ['n1', 'failed'],
      ['n2', 'sent'],
    ])
  })

  it('skips everything without a sender: the aviso stays in the app', async () => {
    const { store, finish } = fakeStore([pending('n1')])
    expect(await sendPending(store, null, OPTIONS)).toEqual({ sent: 0, failed: 0, skipped: 1 })
    expect(finish).toHaveBeenCalledWith('n1', 'skipped')
  })

  it('skips a hold that already ran out, a slot that already started and an aviso without an address', async () => {
    const { store, finish } = fakeStore([
      pending('n1', { data: { court_name: 'Cancha 2', starts_at: '2026-10-03T22:00:00Z', expires_at: '2026-10-03T20:00:00Z' } }),
      pending('n2', { kind: 'slot_free_now', data: { court_name: 'Cancha 2', starts_at: '2026-10-03T20:00:00Z' } }),
      pending('n3', { email: null }),
    ])
    const sender = vi.fn<EmailSender>(async () => {})
    expect(await sendPending(store, sender, OPTIONS)).toEqual({ sent: 0, failed: 0, skipped: 3 })
    expect(sender).not.toHaveBeenCalled()
    expect(finish.mock.calls.map(([, outcome]) => outcome)).toEqual(['skipped', 'skipped', 'skipped'])
  })

  it('mails an aviso of a championship to come, and skips one of a championship that already started', async () => {
    const data = { championship_name: 'Campeonato T', category_name: 'Libre', partner_name: 'Bruno', waiting: false }
    const { store, finish } = fakeStore([
      pending('n1', { kind: 'championship_promoted', link: '/campeonatos/ch1', data: { ...data, starts_at: '2026-10-17T11:00:00Z' } }),
      pending('n2', { kind: 'championship_promoted', link: '/campeonatos/ch1', data: { ...data, starts_at: '2026-10-01T11:00:00Z' } }),
    ])
    const sender = vi.fn<EmailSender>(async () => {})
    expect(await sendPending(store, sender, OPTIONS)).toEqual({ sent: 1, failed: 0, skipped: 1 })
    expect(sender.mock.calls[0][0]).toMatchObject({ to: 'n1@test.local', subject: 'Entraste a Libre desde la lista de espera' })
    expect(finish.mock.calls).toEqual([
      ['n1', 'sent'],
      ['n2', 'skipped'],
    ])
  })
})

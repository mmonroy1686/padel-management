// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { EmailMessage } from '@/lib/notify/email'
import { buildInvitationEmail, type PendingInvitation } from '@/lib/notify/invitations'
import { mailQueue, type MailQueue } from '@/lib/notify/send-pending'

const INVITATION: PendingInvitation = {
  id: 'i1',
  email: 'recepcion@test.local',
  role: 'reception',
  inviterName: 'Dani Admin',
  clubName: 'Rustic Pádel',
  clubLogoPath: null,
  clubPrimary: '#FCB021',
  clubBackground: '#021716',
  clubSlug: 'rustic',
}
const URLS = { clubUrl: (slug: string) => `https://${slug}.test`, supabaseUrl: 'https://db.test' }

describe('buildInvitationEmail', () => {
  it('invites to the club with the role, who invited and the link to accept on its subdomain', () => {
    const mail = buildInvitationEmail(INVITATION, URLS)
    expect(mail.to).toBe('recepcion@test.local')
    expect(mail.subject).toBe('Te invitaron a Rustic Pádel como recepción')
    expect(mail.text).toContain('Dani Admin te invitó a ser parte del staff de Rustic Pádel.')
    expect(mail.text).toContain('Entrá con este email (recepcion@test.local)')
    expect(mail.text).toContain('Aceptar invitación: https://rustic.test/invitacion')
    expect(mail.html).toContain('href="https://rustic.test/invitacion"')
  })

  it('says it without a name when the admin who invited is gone, and names the admin role', () => {
    const mail = buildInvitationEmail({ ...INVITATION, role: 'admin', inviterName: null }, URLS)
    expect(mail.subject).toBe('Te invitaron a Rustic Pádel como admin')
    expect(mail.text).toContain('Te invitaron a ser parte del staff de Rustic Pádel.')
  })
})

describe('mailQueue', () => {
  function queue(items: { id: string }[]): MailQueue<{ id: string }> & { finished: [string, string][] } {
    const finished: [string, string][] = []
    return { finished, claim: async () => items, finish: async (id, outcome) => void finished.push([id, outcome]) }
  }
  const message = (id: string): EmailMessage => ({ to: `${id}@test.local`, subject: id, html: id, text: id })

  it('mails what it can build, skips the rest and marks each one', async () => {
    const store = queue([{ id: 'a' }, { id: 'b' }])
    const sender = vi.fn(async () => {})
    const report = await mailQueue(store, sender, (item) => (item.id === 'a' ? message('a') : null))
    expect(report).toEqual({ sent: 1, failed: 0, skipped: 1 })
    expect(store.finished).toEqual([['a', 'sent'], ['b', 'skipped']])
  })

  it('marks a mail that failed, and skips all without a sender', async () => {
    const failing = queue([{ id: 'a' }])
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await mailQueue(failing, async () => Promise.reject(new Error('down')), () => message('a'))).toEqual({
      sent: 0,
      failed: 1,
      skipped: 0,
    })
    const quiet = queue([{ id: 'a' }])
    expect(await mailQueue(quiet, null, () => message('a'))).toEqual({ sent: 0, failed: 0, skipped: 1 })
  })
})

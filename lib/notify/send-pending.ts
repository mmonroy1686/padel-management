import { isNotificationStale } from '@/lib/domain/notifications'
import type { EmailMessage, EmailSender } from './email'
import { buildEmail, type EmailUrls, type PendingEmail } from './messages'

export type EmailOutcome = 'sent' | 'failed' | 'skipped'

// A table of mails waiting to go out, through its two service-role functions (avisos, staff invitations).
export type MailQueue<T extends { id: string }> = {
  claim: (limit: number) => Promise<T[]>
  finish: (id: string, outcome: EmailOutcome) => Promise<void>
}

// The avisos (the notifications table).
export type OutboxStore = MailQueue<PendingEmail>

export type OutboxReport = Record<EmailOutcome, number>

const BATCH = 20

// Too late to be useful: the hold ran out, or the slot or the championship already started.
function isStale(item: PendingEmail, now: Date): boolean {
  return isNotificationStale(item.kind, item.data, now)
}

// Claims a batch (two runs never take the same row), mails each one that `build` makes a message of and marks how it
// went. Without a sender everything is skipped: what the mail says is still in the app.
export async function mailQueue<T extends { id: string }>(
  store: MailQueue<T>,
  sender: EmailSender | null,
  build: (item: T) => EmailMessage | null,
): Promise<OutboxReport> {
  const report: OutboxReport = { sent: 0, failed: 0, skipped: 0 }
  for (const item of await store.claim(BATCH)) {
    const message = sender ? build(item) : null
    let outcome: EmailOutcome = 'skipped'
    if (sender && message) {
      try {
        await sender(message)
        outcome = 'sent'
      } catch (error) {
        console.error(`No se pudo mandar el mail ${item.id}`, error)
        outcome = 'failed'
      }
    }
    await store.finish(item.id, outcome)
    report[outcome] += 1
  }
  return report
}

// The avisos: a stale one is skipped.
export async function sendPending(
  store: OutboxStore,
  sender: EmailSender | null,
  options: EmailUrls & { now?: Date },
): Promise<OutboxReport> {
  const now = options.now ?? new Date()
  return mailQueue(store, sender, (item) => (isStale(item, now) ? null : buildEmail(item, options)))
}

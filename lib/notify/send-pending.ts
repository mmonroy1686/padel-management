import { isNotificationStale } from '@/lib/domain/notifications'
import type { EmailSender } from './email'
import { buildEmail, type PendingEmail } from './messages'

export type EmailOutcome = 'sent' | 'failed' | 'skipped'

// Where the avisos wait to be mailed (the notifications table, through the service role).
export type OutboxStore = {
  claim: (limit: number) => Promise<PendingEmail[]>
  finish: (id: string, outcome: EmailOutcome) => Promise<void>
}

export type OutboxReport = Record<EmailOutcome, number>

const BATCH = 20

// Too late to be useful: the hold ran out, or the slot or the championship already started.
function isStale(item: PendingEmail, now: Date): boolean {
  return isNotificationStale(item.kind, item.data, now)
}

// Claims a batch (two runs never take the same aviso), mails each one and marks how it went. Without a
// sender everything is skipped: the player still has the aviso in the app.
export async function sendPending(
  store: OutboxStore,
  sender: EmailSender | null,
  options: { siteUrl: string; supabaseUrl: string; now?: Date },
): Promise<OutboxReport> {
  const report: OutboxReport = { sent: 0, failed: 0, skipped: 0 }
  const now = options.now ?? new Date()
  for (const item of await store.claim(BATCH)) {
    const message = sender && !isStale(item, now) ? buildEmail(item, options) : null
    let outcome: EmailOutcome = 'skipped'
    if (sender && message) {
      try {
        await sender(message)
        outcome = 'sent'
      } catch (error) {
        console.error(`No se pudo mandar el aviso ${item.id}`, error)
        outcome = 'failed'
      }
    }
    await store.finish(item.id, outcome)
    report[outcome] += 1
  }
  return report
}

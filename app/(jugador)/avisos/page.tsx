import type { Metadata } from 'next'
import { NotificationList } from '@/components/waitlist/notification-list'
import { markNotificationsRead } from '@/lib/actions/waitlist'
import { requirePlayer } from '@/lib/auth/viewer'
import { loadNotifications } from '@/lib/data/waitlist'
import { localDateOf } from '@/lib/domain/time'
import { MarkRead } from './mark-read'

export const metadata: Metadata = { title: 'Avisos' }

export default async function AvisosPage() {
  const viewer = await requirePlayer('/avisos')
  const notifications = await loadNotifications(viewer)
  const today = localDateOf(new Date(), viewer.club.timezone)

  return (
    <>
      {notifications.some((item) => item.unread) ? <MarkRead action={markNotificationsRead} /> : null}
      <div>
        <h1 className="font-display text-4xl font-bold uppercase">Avisos</h1>
        <p className="text-fg-muted">Lo que te avisamos de la lista de espera.</p>
      </div>
      <NotificationList items={notifications} timezone={viewer.club.timezone} today={today} />
    </>
  )
}

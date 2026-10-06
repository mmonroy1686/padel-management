import Link from 'next/link'
import { cn } from '@/lib/cn'
import { dayLabel, timeIn } from '@/lib/domain/format'
import { localDateOf, type LocalDate } from '@/lib/domain/time'
import type { NotificationView } from '@/lib/domain/notifications'

// Design: "/avisos", newest first; each one leads where it says (Inicio's banner, or /reservar that day).
export function NotificationList({ items, timezone, today }: { items: NotificationView[]; timezone: string; today: LocalDate }) {
  if (items.length === 0) {
    return <p className="text-fg-muted">No tenés avisos. Si se libera un turno que esperás, te avisamos acá y por mail.</p>
  }
  return (
    <ul aria-label="Tus avisos" className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={item.link}
            className={cn(
              'flex flex-col gap-1 rounded-2xl border bg-surface p-4 hover:border-accent focus-visible:outline-2 focus-visible:outline-accent',
              item.unread ? 'border-accent' : 'border-border',
            )}
          >
            <span className="flex items-start justify-between gap-3">
              <span className="font-semibold">{item.title}</span>
              {item.unread ? (
                <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-on-accent">Nuevo</span>
              ) : null}
            </span>
            <span className="text-sm text-fg-muted">{item.body}</span>
            <span className="text-xs text-fg-muted">
              {dayLabel(localDateOf(item.createdAt, timezone), today)} {timeIn(item.createdAt, timezone)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

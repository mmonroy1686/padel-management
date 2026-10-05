import Link from 'next/link'
import { Icon } from '@/components/ui/icon'
import { unreadLabel } from '@/lib/domain/waitlist'

// Design: the header's bell, with how many avisos are unread; it leads to /avisos.
export function NotificationBell({ unread }: { unread: number }) {
  return (
    <Link
      href="/avisos"
      aria-label={unreadLabel(unread)}
      className="relative inline-flex size-11 items-center justify-center rounded-full text-fg hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
    >
      <Icon name="bell" className="size-6" />
      {unread > 0 ? (
        <span
          aria-hidden="true"
          className="absolute right-0.5 top-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1 text-xs font-bold text-on-accent"
        >
          {unread > 9 ? '9+' : unread}
        </span>
      ) : null}
    </Link>
  )
}

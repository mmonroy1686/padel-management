import Link from 'next/link'
import type { ReactNode } from 'react'
import { Icon, type IconName } from '@/components/ui/icon'
import { cn } from '@/lib/cn'

// A list as rows with a line between them, instead of a stack of cards: the name and its detail on the left, what
// to do on the right.
export function RowList({ label, className, children }: { label?: string; className?: string; children: ReactNode }) {
  return (
    <ul aria-label={label} className={cn('divide-y divide-border border-y border-border', className)}>
      {children}
    </ul>
  )
}

// A row that is a link as a whole: optional icon, title, detail and a chevron.
export function RowLink({
  href,
  icon,
  title,
  detail,
  trailing,
}: {
  href: string
  icon?: IconName
  title: ReactNode
  detail?: ReactNode
  trailing?: ReactNode
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-14 items-center gap-3 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {icon ? <Icon name={icon} className="text-accent-ink" /> : null}
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{title}</span>
          {detail ? <span className="sr-only">, </span> : null}
          {detail ? <span className="block text-sm text-fg-muted">{detail}</span> : null}
        </span>
        {trailing}
        <Icon name="chevron-right" className="size-5 text-fg-muted" />
      </Link>
    </li>
  )
}

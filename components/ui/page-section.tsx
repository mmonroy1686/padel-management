import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

// A section of a screen without a card around it: the title (normal case, semibold; only the screen's own title
// is condensed uppercase) and an optional link to see more. Space above separates sections, not borders.
export function PageSection({
  id,
  title,
  more,
  className,
  children,
}: {
  id: string
  title: string
  more?: { href: string; label: string }
  className?: string
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        {more ? (
          <Link href={more.href} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-ink">
            {more.label}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  )
}

// What a section says when it has nothing: one quiet line, with an optional way forward.
export function EmptyLine({ children, action }: { children: ReactNode; action?: { href: string; label: string } }) {
  return (
    <p className="text-fg-muted">
      {children}
      {action ? (
        <>
          {' '}
          <Link href={action.href} className="font-semibold text-accent-ink underline underline-offset-4">
            {action.label}
          </Link>
        </>
      ) : null}
    </p>
  )
}

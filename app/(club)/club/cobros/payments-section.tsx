import type { ReactNode } from 'react'
import { Icon, type IconName } from '@/components/ui/icon'
import { formatPrice } from '@/lib/domain/format'
import type { PaymentsTotals } from '@/lib/domain/payments-overview'
import { cn } from '@/lib/cn'

export type SectionTone = 'accent' | 'court' | 'danger'

const TONE_TEXT: Record<SectionTone, string> = {
  accent: 'text-accent-ink',
  court: 'text-court-ink',
  danger: 'text-danger',
}

// One of the three money lists: what it is for, how much is in it, and the items or an all-clear.
export function PaymentsSection({
  id,
  icon,
  tone,
  title,
  hint,
  totals,
  emptyText,
  children,
}: {
  id: string
  icon: IconName
  tone: SectionTone
  title: string
  hint: string
  totals: PaymentsTotals
  emptyText: string
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="flex scroll-mt-4 flex-col gap-3">
      <header className="flex items-start gap-3">
        <span className={cn('mt-1 grid size-9 shrink-0 place-items-center rounded-xl bg-surface', TONE_TEXT[tone])}>
          <Icon name={icon} />
        </span>
        <div className="flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h2 id={id} className="font-display text-2xl font-bold uppercase">
              {title}
            </h2>
            {totals.count > 0 ? (
              <span className="text-sm font-semibold text-fg-muted tabular-nums">
                {totals.count} · {formatPrice(totals.total)}
              </span>
            ) : null}
          </div>
          <p className="text-sm text-fg-muted">{hint}</p>
        </div>
      </header>
      {totals.count > 0 ? (
        children
      ) : (
        <p className="flex items-center gap-3 rounded-2xl border border-dashed border-border p-4 text-fg-muted">
          <Icon name="check-circle" className="text-court-ink" />
          {emptyText}
        </p>
      )}
    </section>
  )
}

// Link tile in the summary strip: jumps to its list.
export function SummaryTile({ href, label, totals, tone }: { href: string; label: string; totals: PaymentsTotals; tone: SectionTone }) {
  const pending = totals.count > 0
  return (
    <a
      href={href}
      className={cn(
        'flex min-h-11 flex-col gap-1 rounded-2xl border bg-surface p-3 transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-accent',
        pending ? 'border-border' : 'border-transparent',
      )}
    >
      <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{label}</span>
      <span className={cn('font-display text-2xl font-bold tabular-nums sm:text-3xl', pending ? TONE_TEXT[tone] : 'text-fg-muted')}>
        {formatPrice(totals.total)}
      </span>
      <span className="text-sm text-fg-muted tabular-nums">{pending ? `${totals.count} pendiente${totals.count === 1 ? '' : 's'}` : 'Al día'}</span>
    </a>
  )
}

// Who, when, where and how much: the same head for every item in the lists.
export function PaymentItemHead({ holder, when, courtName, amount, amountLabel }: {
  holder: string
  when: string
  courtName: string
  amount: number
  amountLabel: string
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-semibold">{holder}</p>
        <p className="flex items-center gap-1.5 text-sm text-fg-muted">
          <Icon name="calendar" className="size-4" />
          {when}
        </p>
        {courtName ? (
          <p className="flex items-center gap-1.5 text-sm text-fg-muted">
            <Icon name="pin" className="size-4" />
            {courtName}
          </p>
        ) : null}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs text-fg-muted">{amountLabel}</p>
        <p className="font-display text-2xl font-bold tabular-nums">{formatPrice(amount)}</p>
      </div>
    </div>
  )
}

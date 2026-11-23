import type { ReactNode } from 'react'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/domain/format'
import { KIND_LABELS, METHOD_LABELS, type BoardItem } from '@/lib/domain/payments-board'

// One payment on the Cobros board: who, what, when and how much; its button below, or how it came in once done.
export function BoardCard({ item, children }: { item: BoardItem; children?: ReactNode }) {
  return (
    <article
      aria-label={item.holder}
      className={cn('flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3', item.done && 'border-transparent bg-bg')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{item.holder}</p>
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{KIND_LABELS[item.kind]}</p>
          {item.what ? <p className="text-sm">{item.what}</p> : null}
          {item.when ? <p className="text-sm text-fg-muted">{item.when}</p> : null}
        </div>
        <p className={cn('shrink-0 font-display text-xl font-bold tabular-nums', item.done && 'text-fg-muted')}>{formatPrice(item.amount)}</p>
      </div>
      {item.done ? (
        <p className="flex items-center gap-1.5 text-sm text-fg-muted">
          <Icon name="check-circle" className="size-4 text-court-ink" />
          {METHOD_LABELS[item.done.method]} · {item.done.time}
        </p>
      ) : null}
      {children}
    </article>
  )
}

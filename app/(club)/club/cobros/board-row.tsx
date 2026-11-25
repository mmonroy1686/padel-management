import type { ReactNode } from 'react'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/domain/format'
import { KIND_LABELS, METHOD_LABELS, type BoardItem } from '@/lib/domain/payments-board'

// One payment on the Cobros board, compact: who, how much and its button on one line; kind, what and when below; how
// it came in (or why it was rejected) once done. A transfer to confirm links its receipt.
// `below`: what opens under the row (how the player paid, or an error).
export function BoardRow({ item, children, below }: { item: BoardItem; children?: ReactNode; below?: ReactNode }) {
  const detail = [KIND_LABELS[item.kind], item.what, item.when].filter(Boolean).join(' · ')
  return (
    <article aria-label={item.holder} className="flex flex-col gap-0.5 py-2.5">
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 break-words font-semibold">{item.holder}</p>
        <p
          className={cn(
            'shrink-0 font-display text-xl font-bold tabular-nums',
            item.done && 'text-fg-muted',
            item.done?.rejection && 'line-through',
          )}
        >
          {formatPrice(item.amount)}
        </p>
        {children}
      </div>
      <p className="text-sm text-fg-muted">
        {detail}
        {item.action?.type === 'review' ? (
          item.action.receiptUrl ? (
            <>
              {' · '}
              <a
                href={item.action.receiptUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`Ver comprobante de ${item.holder}`}
                className="font-semibold text-accent-ink underline"
              >
                Comprobante
              </a>
            </>
          ) : (
            ' · Sin comprobante'
          )
        ) : null}
      </p>
      {item.done ? (
        <p className="flex items-center gap-1.5 text-sm text-fg-muted">
          {item.done.rejection ? (
            <>
              <Icon name="cancel" className="size-4 text-danger" />
              Rechazada · {item.done.time} · {item.done.rejection}
            </>
          ) : (
            <>
              <Icon name="check-circle" className="size-4 text-court-ink" />
              {METHOD_LABELS[item.done.method]} · {item.done.time}
            </>
          )}
        </p>
      ) : null}
      {below}
    </article>
  )
}

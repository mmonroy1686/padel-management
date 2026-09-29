import { cn } from '@/lib/cn'
import { PAYMENT_LABELS, type PaymentState } from '@/lib/domain/payments'

const STYLES: Record<PaymentState, string> = {
  paid: 'border-court-ink text-court-ink',
  reported: 'border-accent-ink text-accent-ink',
  pending: 'border-fg-muted text-fg',
  refund_due: 'border-accent-ink text-accent-ink',
  none: 'border-border text-fg-muted',
}

// Always on the page background, so it reads the same inside a blue or amber cell.
export function PaymentBadge({ state, className }: { state: PaymentState; className?: string }) {
  return (
    <span
      data-state={state}
      className={cn('inline-flex items-center rounded-full border bg-bg px-2 py-0.5 text-xs font-semibold', STYLES[state], className)}
    >
      {PAYMENT_LABELS[state]}
    </span>
  )
}

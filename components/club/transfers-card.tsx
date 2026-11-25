import Link from 'next/link'
import { Icon } from '@/components/ui/icon'
import type { TransfersSummary } from '@/lib/domain/club-home'

// One row at the top of Pendientes de cobro when players reported transfers: how many, how much and how old the
// oldest is. The whole row goes to Cobros to confirm them.
export function TransfersCard({ summary }: { summary: TransfersSummary }) {
  return (
    <section aria-label="Transferencias por confirmar">
      <Link
        href="/club/cobros#transferencias"
        className="flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Icon name="transfer" className="text-accent-ink" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{summary.text}</span>
          <span className="sr-only">, </span>
          <span className="block text-sm text-fg-muted">{summary.age} · Revisar en Cobros</span>
        </span>
        <Icon name="chevron-right" className="size-5 text-fg-muted" />
      </Link>
    </section>
  )
}

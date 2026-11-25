import Link from 'next/link'
import { buttonClasses } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import type { TransfersSummary } from '@/lib/domain/club-home'

// The top of the Inicio when players reported transfers: how many, how much, how old the oldest is, and "Revisar"
// to confirm them in Cobros.
export function TransfersCard({ summary }: { summary: TransfersSummary }) {
  return (
    <section
      aria-label="Transferencias por confirmar"
      className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4"
    >
      <Icon name="transfer" className="size-6 text-accent-ink" />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="font-semibold">{summary.text}</p>
        <p className="text-sm text-fg-muted">{summary.age}</p>
      </div>
      <Link href="/club/cobros#transferencias" className={buttonClasses({ variant: 'secondary' })}>
        Revisar →
      </Link>
    </section>
  )
}

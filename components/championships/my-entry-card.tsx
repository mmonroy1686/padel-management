import { PaymentBadge } from '@/components/booking/payment-badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { EntryPaymentView } from '@/lib/domain/tournament-payments'

// One of the viewer's pairs, as /campeonatos/[id] prepares it. payment: null for a waiting pair or a free
// category.
export type MyEntryView = {
  entryId: string
  categoryName: string
  partnerName: string
  stateText: string
  waiting: boolean
  payment: EntryPaymentView | null
  hoursText: string
  canWithdraw: boolean
  canEditHours: boolean
}

// Design: "Tus inscripciones": pair, place (or place in line), payment, hours and "Darme de baja".
export function MyEntryCard({
  view,
  onPay,
  onHours,
  onLeave,
}: {
  view: MyEntryView
  onPay: () => void
  onHours: () => void
  onLeave: () => void
}) {
  return (
    <Card className="flex h-full flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{view.categoryName}</p>
          <p className="text-sm text-fg-muted">Con {view.partnerName}</p>
        </div>
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-semibold">{view.stateText}</span>
      </div>
      {view.payment ? (
        <div className="flex flex-wrap items-center gap-3">
          <PaymentBadge state={view.payment.state} />
          {view.payment.canReportTransfer ? (
            <Button variant="secondary" onClick={onPay}>
              Ya transferí
            </Button>
          ) : null}
          {view.payment.rejectionReason ? (
            <p className="w-full text-sm">El club rechazó la transferencia: {view.payment.rejectionReason}.</p>
          ) : null}
        </div>
      ) : view.waiting ? (
        <p className="text-sm text-fg-muted">Pagan cuando entren: si se libera un lugar, entran solos y te avisamos.</p>
      ) : null}
      <p className="text-sm">{view.hoursText}</p>
      {view.canEditHours || view.canWithdraw ? (
        <div className="mt-auto flex flex-wrap gap-2">
          {view.canEditHours ? (
            <Button variant="secondary" onClick={onHours}>
              Horarios imposibles
            </Button>
          ) : null}
          {view.canWithdraw ? (
            <Button variant="ghost" onClick={onLeave}>
              Darme de baja
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}

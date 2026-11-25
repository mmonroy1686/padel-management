import { PaymentBadge } from '@/components/booking/payment-badge'
import { DeskCharge } from '@/components/club/desk-charge'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { PASS_STATUS_LABELS, type DayUsePass } from '@/lib/domain/day-use'
import { formatPrice, timeIn } from '@/lib/domain/format'
import { rewardLabel } from '@/lib/domain/loyalty'
import type { DeskMethod } from '@/lib/domain/payments'
import type { LocalDate } from '@/lib/domain/time'
import { entryPaymentView } from '@/lib/domain/tournament-payments'

export type PassActions = { checkIn: FormAction; cash: FormAction; cancel: FormAction }

// One pass for reception: in "Hoy" and on the page the QR opens. Check-in only on its day
// (check_in_day_use answers not_today); cash for what it owes while no transfer waits for review.
export function PassStaffCard({
  pass,
  today,
  timezone,
  deskMethods,
  actions,
  onDone,
}: {
  pass: DayUsePass
  today: LocalDate
  timezone: string
  deskMethods: DeskMethod[]
  actions: PassActions
  onDone?: (message: string) => void
}) {
  const payment = entryPaymentView(pass.total, pass.payments, false)
  const titleId = `pase-${pass.id}`
  const bought = pass.status === 'bought'

  return (
    <article aria-labelledby={titleId} className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={titleId} className="font-semibold">
            {pass.holder}
            {pass.isGuest ? <>{' '}<span className="font-normal text-fg-muted">(sin cuenta)</span></> : null}
          </h3>
          <p className="text-sm text-fg-muted">
            {pass.productName}, {timeIn(pass.startsAt, timezone)} a {timeIn(pass.endsAt, timezone)}
          </p>
          <p className="text-sm text-fg-muted tabular-nums">
            {pass.code}
            {pass.usedReward ? ` · Recompensa ${rewardLabel(pass.discountPercent)}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold">{PASS_STATUS_LABELS[pass.status]}</span>
          {pass.total > 0 && pass.status !== 'cancelled' ? <PaymentBadge state={payment.state} /> : null}
        </div>
      </div>
      {pass.status === 'inside' && pass.checkedInAt ? (
        <p className="text-sm">Adentro desde las {timeIn(pass.checkedInAt, timezone)}.</p>
      ) : null}
      {bought && pass.date === today ? (
        <ActionForm action={actions.checkIn} submitLabel="Registrar ingreso" pendingLabel="Registrando…" onDone={onDone}>
          <input type="hidden" name="passId" value={pass.id} />
        </ActionForm>
      ) : null}
      {bought && pass.date !== today ? <p className="text-sm text-fg-muted">El ingreso se registra el día del pase.</p> : null}
      {pass.status !== 'cancelled' && payment.state === 'pending' ? (
        <DeskCharge
          action={actions.cash}
          methods={deskMethods}
          label={`Cobrar ${formatPrice(payment.due)}`}
          fields={{ passId: pass.id, amount: payment.due }}
          onDone={onDone}
        />
      ) : null}
      {bought ? (
        <ActionForm action={actions.cancel} submitLabel="Cancelar pase" pendingLabel="Cancelando…" variant="danger" confirmLabel="¿Seguro? Tocá de nuevo" onDone={onDone}>
          <input type="hidden" name="passId" value={pass.id} />
        </ActionForm>
      ) : null}
    </article>
  )
}

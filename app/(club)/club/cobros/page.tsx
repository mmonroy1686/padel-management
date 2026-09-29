import type { Metadata } from 'next'
import { ActionForm } from '@/components/ui/action-form'
import { Card } from '@/components/ui/card'
import { requireStaff } from '@/lib/auth/viewer'
import { loadPaymentsOverview } from '@/lib/data/payments'
import { dayLongLabel, formatPrice, timeIn } from '@/lib/domain/format'
import { localDateOf } from '@/lib/domain/time'
import { recordCash } from '../grilla/actions'
import { confirmPayment, refundPayment, rejectPayment } from './actions'
import { TransferReviewCard } from './transfer-review-card'

export const metadata: Metadata = { title: 'Cobros' }

export default async function PaymentsPage() {
  const viewer = await requireStaff('/club/cobros')
  const { club } = viewer
  const { transfers, unpaid, refunds } = await loadPaymentsOverview(club)
  const when = (start: Date) => `${dayLongLabel(localDateOf(start, club.timezone))}, ${timeIn(start, club.timezone)}`

  return (
    <>
      <section aria-labelledby="transferencias" className="flex flex-col gap-3">
        <h2 id="transferencias" className="font-display text-2xl font-bold uppercase">
          Transferencias para confirmar
        </h2>
        {transfers.length > 0 ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {transfers.map((transfer) => (
              <li key={transfer.id}>
                <TransferReviewCard
                  transfer={{
                    id: transfer.id,
                    amount: transfer.amount,
                    holder: transfer.holder,
                    when: transfer.startsAt ? when(transfer.startsAt) : '',
                    courtName: transfer.courtName,
                    receiptUrl: transfer.receiptUrl,
                  }}
                  confirmAction={confirmPayment}
                  rejectAction={rejectPayment}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-fg-muted">No hay transferencias para confirmar.</p>
        )}
      </section>

      <section aria-labelledby="sin-pagar" className="flex flex-col gap-3">
        <h2 id="sin-pagar" className="font-display text-2xl font-bold uppercase">
          Reservas jugadas sin pagar
        </h2>
        {unpaid.length > 0 ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {unpaid.map((item) => (
              <li key={item.bookingId}>
                <Card className="flex flex-col gap-2">
                  <p className="font-semibold">{item.holder}</p>
                  <p className="text-fg-muted">
                    {when(item.startsAt)}, {item.courtName}. Debe {formatPrice(item.due)}.
                  </p>
                  {club.accepts_cash ? (
                    <ActionForm action={recordCash} submitLabel="Cobrar en efectivo" variant="secondary">
                      <input type="hidden" name="bookingId" value={item.bookingId} />
                      <input type="hidden" name="amount" value={item.due} />
                    </ActionForm>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-fg-muted">Nada pendiente en los últimos 30 días.</p>
        )}
      </section>

      <section aria-labelledby="devolver" className="flex flex-col gap-3">
        <h2 id="devolver" className="font-display text-2xl font-bold uppercase">
          Pagos a devolver
        </h2>
        {refunds.length > 0 ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {refunds.map((item) => (
              <li key={item.paymentId}>
                <Card className="flex flex-col gap-2">
                  <p className="font-semibold">{item.holder}</p>
                  <p className="text-fg-muted">
                    Canceló {when(item.startsAt)}, {item.courtName}. Pagó {formatPrice(item.amount)}.
                  </p>
                  <ActionForm action={refundPayment} submitLabel="Marcar devuelto" variant="secondary">
                    <input type="hidden" name="paymentId" value={item.paymentId} />
                  </ActionForm>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-fg-muted">No hay devoluciones pendientes.</p>
        )}
      </section>
    </>
  )
}

import type { Metadata } from 'next'
import { ActionForm } from '@/components/ui/action-form'
import { Card } from '@/components/ui/card'
import { requireStaff } from '@/lib/auth/viewer'
import { loadPaymentsOverview } from '@/lib/data/payments'
import { dayLongLabel, timeIn } from '@/lib/domain/format'
import { totalsOf } from '@/lib/domain/payments-overview'
import { localDateOf } from '@/lib/domain/time'
import { recordCash } from '../grilla/actions'
import { recordTournamentCash } from '../torneos/actions'
import { confirmPayment, refundPayment, rejectPayment } from './actions'
import { PaymentItemHead, PaymentsSection, SummaryTile } from './payments-section'
import { TransferReviewCard } from './transfer-review-card'

export const metadata: Metadata = { title: 'Cobros' }

export default async function PaymentsPage() {
  const viewer = await requireStaff('/club/cobros')
  const { club } = viewer
  const { transfers, unpaid, unpaidEntries, refunds } = await loadPaymentsOverview(club)
  const when = (start: Date) => `${dayLongLabel(localDateOf(start, club.timezone))}, ${timeIn(start, club.timezone)}`

  const totals = {
    transfers: totalsOf(transfers, (transfer) => transfer.amount),
    unpaid: totalsOf([...unpaid, ...unpaidEntries], (item) => item.due),
    refunds: totalsOf(refunds, (item) => item.amount),
  }

  return (
    <>
      <nav aria-label="Resumen de cobros" className="grid grid-cols-3 gap-2 sm:gap-3">
        <SummaryTile href="#transferencias" label="Por confirmar" totals={totals.transfers} tone="accent" />
        <SummaryTile href="#sin-pagar" label="Sin cobrar" totals={totals.unpaid} tone="accent" />
        <SummaryTile href="#devolver" label="A devolver" totals={totals.refunds} tone="danger" />
      </nav>

      <PaymentsSection
        id="transferencias"
        icon="receipt"
        tone="accent"
        title="Transferencias para confirmar"
        hint="Revisá el comprobante y confirmá cuando la plata esté en la cuenta."
        totals={totals.transfers}
        emptyText="No hay transferencias para confirmar."
      >
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
      </PaymentsSection>

      <PaymentsSection
        id="sin-pagar"
        icon="clock"
        tone="accent"
        title="Jugado sin pagar"
        hint="Turnos y torneos de los últimos 30 días que todavía deben plata."
        totals={totals.unpaid}
        emptyText="Nada pendiente en los últimos 30 días."
      >
        {unpaid.map((item) => (
          <li key={`${item.bookingId}-${item.payerId ?? ''}`}>
            <Card className="flex h-full flex-col gap-3">
              <PaymentItemHead holder={item.holder} when={when(item.startsAt)} courtName={item.courtName}
                amount={item.due} amountLabel="Debe" />
              {club.accepts_cash ? (
                <ActionForm action={recordCash} submitLabel="Cobrar en efectivo" pendingLabel="Registrando…" variant="secondary"
                  className="mt-auto">
                  <input type="hidden" name="bookingId" value={item.bookingId} />
                  <input type="hidden" name="amount" value={item.due} />
                  {item.payerId ? <input type="hidden" name="payerId" value={item.payerId} /> : null}
                </ActionForm>
              ) : null}
            </Card>
          </li>
        ))}
        {unpaidEntries.map((item) => (
          <li key={item.entryId}>
            <Card className="flex h-full flex-col gap-3">
              <PaymentItemHead holder={item.holder} when={when(item.startsAt)} courtName={`Torneo ${item.tournamentName}`}
                amount={item.due} amountLabel="Debe" />
              {club.accepts_cash ? (
                <ActionForm action={recordTournamentCash} submitLabel="Cobrar en efectivo" pendingLabel="Registrando…" variant="secondary"
                  className="mt-auto">
                  <input type="hidden" name="entryId" value={item.entryId} />
                  <input type="hidden" name="amount" value={item.due} />
                </ActionForm>
              ) : null}
            </Card>
          </li>
        ))}
      </PaymentsSection>

      <PaymentsSection
        id="devolver"
        icon="undo"
        tone="danger"
        title="Pagos a devolver"
        hint="Reservas o torneos cancelados, o jugadores que se bajaron después de pagar."
        totals={totals.refunds}
        emptyText="No hay devoluciones pendientes."
      >
        {refunds.map((item) => (
          <li key={item.paymentId}>
            <Card className="flex h-full flex-col gap-3">
              <PaymentItemHead holder={item.holder} when={when(item.startsAt)} courtName={item.courtName}
                amount={item.amount} amountLabel="Devolver" />
              <ActionForm action={refundPayment} submitLabel="Marcar devuelto" pendingLabel="Guardando…" variant="secondary"
                className="mt-auto">
                <input type="hidden" name="paymentId" value={item.paymentId} />
              </ActionForm>
            </Card>
          </li>
        ))}
      </PaymentsSection>
    </>
  )
}

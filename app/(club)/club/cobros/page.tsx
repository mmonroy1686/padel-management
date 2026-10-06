import type { Metadata } from 'next'
import { requireStaff } from '@/lib/auth/viewer'
import { loadPaymentsOverview } from '@/lib/data/payments'
import { dayLongLabel, timeIn } from '@/lib/domain/format'
import { totalsOf } from '@/lib/domain/payments-overview'
import { localDateOf } from '@/lib/domain/time'
import { recordCash } from '../grilla/actions'
import { recordPassCash } from '../day-use/actions'
import { recordChampionshipCash } from '../torneos/campeonatos/actions'
import { recordTournamentCash } from '../torneos/actions'
import { confirmPayment, refundPayment, rejectPayment } from './actions'
import { MoneyTable, type MoneyItem } from './money-table'
import { PaymentsSection, SummaryTile } from './payments-section'
import { TransfersTable } from './transfers-table'

export const metadata: Metadata = { title: 'Cobros' }

export default async function PaymentsPage() {
  const viewer = await requireStaff('/club/cobros')
  const { club } = viewer
  const { transfers, unpaid, unpaidEntries, unpaidPasses, unpaidChampionships, refunds } = await loadPaymentsOverview(club)
  const when = (start: Date) => `${dayLongLabel(localDateOf(start, club.timezone))}, ${timeIn(start, club.timezone)}`

  const cash = (label: string, fields: Record<string, string>) => (club.accepts_cash ? { action: { label, fields } } : {})
  const owed: MoneyItem[] = [
    ...unpaid.map((item) => ({
      id: `${item.bookingId}-${item.payerId ?? ''}`,
      kind: 'booking' as const,
      holder: item.holder,
      what: item.courtName,
      when: when(item.startsAt),
      at: item.startsAt.getTime(),
      amount: item.due,
      ...cash('Cobrar en efectivo', {
        bookingId: item.bookingId,
        amount: String(item.due),
        ...(item.payerId ? { payerId: item.payerId } : {}),
      }),
    })),
    ...unpaidEntries.map((item) => ({
      id: item.entryId,
      kind: 'tournament' as const,
      holder: item.holder,
      what: `Torneo ${item.tournamentName}`,
      when: when(item.startsAt),
      at: item.startsAt.getTime(),
      amount: item.due,
      ...cash('Cobrar en efectivo', { entryId: item.entryId, amount: String(item.due) }),
    })),
    ...unpaidPasses.map((item) => ({
      id: item.passId,
      kind: 'day_use' as const,
      holder: item.holder,
      what: item.productName,
      when: when(item.startsAt),
      at: item.startsAt.getTime(),
      amount: item.due,
      ...cash('Cobrar en efectivo', { passId: item.passId, amount: String(item.due) }),
    })),
    ...unpaidChampionships.map((item) => ({
      id: item.entryId,
      kind: 'championship' as const,
      holder: item.holder,
      what: item.what,
      when: when(item.startsAt),
      at: item.startsAt.getTime(),
      amount: item.due,
      ...cash('Cobrar en efectivo', { entryId: item.entryId, amount: String(item.due) }),
    })),
  ]
  const toGiveBack: MoneyItem[] = refunds.map((item) => ({
    id: item.paymentId,
    kind: item.kind,
    holder: item.holder,
    what: item.courtName,
    when: when(item.startsAt),
    at: item.startsAt.getTime(),
    amount: item.amount,
    action: { label: 'Marcar devuelto', fields: { paymentId: item.paymentId } },
  }))

  const totals = {
    transfers: totalsOf(transfers, (transfer) => transfer.amount),
    unpaid: totalsOf([...unpaid, ...unpaidEntries, ...unpaidPasses, ...unpaidChampionships], (item) => item.due),
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
        <TransfersTable
          transfers={transfers.map((transfer) => ({
            id: transfer.id,
            amount: transfer.amount,
            holder: transfer.holder,
            when: transfer.startsAt ? when(transfer.startsAt) : '',
            at: transfer.startsAt?.getTime() ?? 0,
            courtName: transfer.courtName,
            receiptUrl: transfer.receiptUrl,
          }))}
          confirmAction={confirmPayment}
          rejectAction={rejectPayment}
        />
      </PaymentsSection>

      <PaymentsSection
        id="sin-pagar"
        icon="clock"
        tone="accent"
        title="Jugado sin pagar"
        hint="Turnos, torneos, campeonatos y day use de los últimos 30 días que todavía deben plata."
        totals={totals.unpaid}
        emptyText="Nada pendiente en los últimos 30 días."
      >
        <MoneyTable
          caption="Jugado sin pagar"
          items={owed}
          amountLabel="Debe"
          actions={{ booking: recordCash, tournament: recordTournamentCash, day_use: recordPassCash, championship: recordChampionshipCash }}
          emptyText="Nada pendiente en los últimos 30 días."
        />
      </PaymentsSection>

      <PaymentsSection
        id="devolver"
        icon="undo"
        tone="danger"
        title="Pagos a devolver"
        hint="Reservas, torneos, campeonatos o pases de day use cancelados, o jugadores que se bajaron después de pagar."
        totals={totals.refunds}
        emptyText="No hay devoluciones pendientes."
      >
        <MoneyTable
          caption="Pagos a devolver"
          items={toGiveBack}
          amountLabel="Devolver"
          actions={{ booking: refundPayment, tournament: refundPayment, day_use: refundPayment, championship: refundPayment }}
          emptyText="No hay devoluciones pendientes."
        />
      </PaymentsSection>
    </>
  )
}

import type { Metadata } from 'next'
import { requireStaff } from '@/lib/auth/viewer'
import { loadPaymentsOverview } from '@/lib/data/payments'
import { dayLongLabel, timeIn } from '@/lib/domain/format'
import { deskMethods } from '@/lib/domain/payments'
import { clubDayRange, paymentsBoard } from '@/lib/domain/payments-board'
import { localDateOf } from '@/lib/domain/time'
import { recordCash } from '../grilla/actions'
import { recordPassCash } from '../day-use/actions'
import { recordChampionshipCash } from '../torneos/campeonatos/actions'
import { recordTournamentCash } from '../torneos/actions'
import { confirmPayment, confirmPayments, refundPayment, rejectPayment } from './actions'
import { PaymentsBoard } from './payments-board'

export const metadata: Metadata = { title: 'Cobros' }

export default async function PaymentsPage() {
  const viewer = await requireStaff('/club/cobros')
  const { club } = viewer
  const columns = paymentsBoard(await loadPaymentsOverview(club), {
    when: (start) => `${dayLongLabel(localDateOf(start, club.timezone))}, ${timeIn(start, club.timezone)}`,
    time: (instant) => timeIn(instant, club.timezone),
    deskMethods: deskMethods(club),
  })

  return (
    <PaymentsBoard
      columns={columns}
      todayFrom={clubDayRange(new Date(), club.timezone).from.getTime()}
      actions={{
        cash: { booking: recordCash, tournament: recordTournamentCash, day_use: recordPassCash, championship: recordChampionshipCash },
        refund: refundPayment,
        confirm: confirmPayment,
        reject: rejectPayment,
        confirmMany: confirmPayments,
      }}
    />
  )
}

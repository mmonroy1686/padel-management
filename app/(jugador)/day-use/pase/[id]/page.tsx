import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LiveOccupancy } from '@/components/live/live-occupancy'
import { BackLink } from '@/components/ui/back-link'
import { getSiteUrl } from '@/lib/auth/redirect'
import { requirePlayer } from '@/lib/auth/viewer'
import { loadPass } from '@/lib/data/day-use'
import { canCancelPass, passCheckInPath } from '@/lib/domain/day-use'
import { dayLongLabel, timeIn } from '@/lib/domain/format'
import { isUuid } from '@/lib/domain/input'
import { paymentMethodsNote } from '@/lib/domain/payments'
import { entryPaymentView } from '@/lib/domain/tournament-payments'
import { passQrSvg } from '@/lib/qr/pass-qr'
import { cancelMyPass, reportPassTransfer } from '../../actions'
import { PassBoard } from './pass-board'

export const metadata: Metadata = { title: 'Mi pase' }

type Params = Promise<{ id: string }>

export default async function MyPassPage({ params }: { params: Params }) {
  const { id } = await params
  if (!isUuid(id)) notFound()
  const viewer = await requirePlayer(`/day-use/pase/${id}`)
  const { club } = viewer
  const pass = await loadPass(club, id)
  // Staff can read any pass of the club: this screen is only for its owner.
  if (!pass || pass.playerId !== viewer.userId) notFound()

  const qrSvg = await passQrSvg(`${getSiteUrl()}${passCheckInPath(pass.code)}`)

  return (
    <>
      <LiveOccupancy clubId={club.id} />
      <BackLink href="/day-use">Volver a day use</BackLink>
      <PassBoard
        pass={pass}
        viewerId={viewer.userId}
        qrSvg={qrSvg}
        whenText={`${dayLongLabel(pass.date)}, ${timeIn(pass.startsAt, club.timezone)} a ${timeIn(pass.endsAt, club.timezone)}`}
        timezone={club.timezone}
        payment={entryPaymentView(pass.total, pass.payments, club.accepts_transfer)}
        paymentNote={paymentMethodsNote(club)}
        transfer={{ details: club.transfer_details, receiptRequired: club.transfer_receipt_required }}
        canCancel={canCancelPass(pass, new Date())}
        cancelAction={cancelMyPass}
        reportAction={reportPassTransfer}
      />
    </>
  )
}

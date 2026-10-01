'use client'

import Link from 'next/link'
import { useCallback, useState } from 'react'
import { PaymentBadge } from '@/components/booking/payment-badge'
import { TransferSheet, type ReportTransfer } from '@/components/booking/transfer-sheet'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button, buttonClasses } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatPrice } from '@/lib/domain/format'
import type { MyBookingView } from '@/lib/domain/my-bookings'

export function MyBookingCard({
  booking,
  userId,
  transfer,
  cancelAction,
  reportAction,
}: {
  booking: MyBookingView
  userId: string
  transfer: { details: string | null; receiptRequired: boolean }
  cancelAction: FormAction
  reportAction: ReportTransfer
}) {
  const [sheet, setSheet] = useState<'cancel' | 'transfer' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const close = useCallback(() => setSheet(null), [])
  const done = useCallback((message: string) => {
    setSheet(null)
    setNotice(message)
  }, [])

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-xl font-bold uppercase">{booking.dateText}</p>
          <p>
            {booking.timeText}, {booking.courtName}
          </p>
          {booking.matchId ? <p className="text-sm font-semibold">Partido abierto, tu parte</p> : null}
          <p className="text-fg-muted">{formatPrice(booking.price)}</p>
        </div>
        <PaymentBadge state={booking.paymentState} />
      </div>
      {booking.cancelled ? <p className="text-sm text-fg-muted">Cancelada</p> : null}
      {booking.rejectionReason ? (
        <p className="text-sm">El club rechazó la transferencia: {booking.rejectionReason}.</p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm">
          {notice}
        </p>
      ) : null}
      {booking.upcoming ? (
        <div className="flex flex-wrap items-center gap-2">
          {booking.canReportTransfer ? (
            <Button variant="secondary" onClick={() => setSheet('transfer')}>
              Ya transferí
            </Button>
          ) : null}
          {booking.matchId ? (
            <Link href={`/partidos/${booking.matchId}`} className={buttonClasses({ variant: 'ghost' })}>
              Ver partido
            </Link>
          ) : booking.cancel.allowed ? (
            <Button variant="ghost" onClick={() => setSheet('cancel')}>
              Cancelar reserva
            </Button>
          ) : (
            <p className="text-sm text-fg-muted">{booking.cancel.reason}</p>
          )}
        </div>
      ) : null}

      <BottomSheet open={sheet === 'cancel'} onClose={close} title="Cancelar reserva">
        <p className="mb-4">
          {booking.dateText}, {booking.timeText}, {booking.courtName}. La cancha queda libre para otro.
        </p>
        <ActionForm action={cancelAction} submitLabel="Sí, cancelar" pendingLabel="Cancelando…" onDone={done}>
          <input type="hidden" name="bookingId" value={booking.id} />
        </ActionForm>
      </BottomSheet>
      {sheet === 'transfer' ? (
        <TransferSheet
          bookingId={booking.id}
          userId={userId}
          amount={booking.amountDue}
          details={transfer.details}
          receiptRequired={transfer.receiptRequired}
          reportAction={reportAction}
          onClose={close}
          onDone={done}
        />
      ) : null}
    </Card>
  )
}

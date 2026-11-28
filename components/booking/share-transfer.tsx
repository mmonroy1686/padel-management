'use client'

import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { formatPrice } from '@/lib/domain/format'
import { TransferSheet, type ReportTransfer } from './transfer-sheet'

// A player of a shared booking pays their own share by transfer; most pay at the club, so it is a secondary action.
export function ShareTransfer({
  bookingId,
  userId,
  amount,
  details,
  receiptRequired,
  reportAction,
}: {
  bookingId: string
  userId: string
  amount: number
  details: string | null
  receiptRequired: boolean
  reportAction: ReportTransfer
}) {
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const close = useCallback(() => setOpen(false), [])
  const done = useCallback((message: string) => {
    setOpen(false)
    setNotice(message)
  }, [])

  if (notice) {
    return (
      <p role="status" className="notice-in text-sm">
        {notice}
      </p>
    )
  }
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Transferir mi parte, {formatPrice(amount)}
      </Button>
      {open ? (
        <TransferSheet
          bookingId={bookingId}
          userId={userId}
          amount={amount}
          details={details}
          receiptRequired={receiptRequired}
          reportAction={reportAction}
          onClose={close}
          onDone={done}
        />
      ) : null}
    </>
  )
}

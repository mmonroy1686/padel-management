'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { failed, IDLE, type ActionState } from '@/lib/actions/result'
import { errorMessage } from '@/lib/domain/errors'
import { formatPrice } from '@/lib/domain/format'
import { uploadReceipt, type UploadResult } from '@/lib/storage/receipts'

export type ReportTransfer = (bookingId: string, receiptPath: string | null) => Promise<ActionState>
export type UploadReceipt = (userId: string, bookingId: string, file: File) => Promise<UploadResult>

export type TransferSheetProps = {
  bookingId: string
  userId: string
  amount: number
  details: string | null
  receiptRequired: boolean
  reportAction: ReportTransfer
  upload?: UploadReceipt
  onClose: () => void
  onDone: (message: string) => void
}

// The app does not move money: it shows where to transfer and tells the club it was done.
export function TransferSheet({
  bookingId,
  userId,
  amount,
  details,
  receiptRequired,
  reportAction,
  upload = uploadReceipt,
  onClose,
  onDone,
}: TransferSheetProps) {
  const [state, formAction, pending] = useActionState(async (_previous: ActionState, form: FormData) => {
    const file = form.get('receipt')
    let path: string | null = null
    if (file instanceof File && file.size > 0) {
      const uploaded = await upload(userId, bookingId, file)
      if ('error' in uploaded) return failed(uploaded.error)
      path = uploaded.path
    } else if (receiptRequired) {
      return failed(errorMessage('receipt_required'))
    }
    const result = (await reportAction(bookingId, path)) ?? IDLE
    if (result.status === 'ok') onDone(result.message ?? '')
    return result
  }, IDLE)

  return (
    <BottomSheet open onClose={onClose} title="Ya transferí">
      <div className="flex flex-col gap-4">
        <p>
          Transferí <strong>{formatPrice(amount)}</strong> a esta cuenta y subí el comprobante. El club confirma el pago
          cuando lo ve.
        </p>
        <p className="whitespace-pre-line rounded-xl border border-border bg-bg p-3">
          {details ?? 'El club todavía no cargó sus datos de transferencia. Consultá en recepción.'}
        </p>
        <form action={formAction} className="flex flex-col gap-3">
          <label htmlFor="receipt" className="text-sm font-semibold">
            {receiptRequired ? 'Comprobante' : 'Comprobante (opcional)'}
          </label>
          {/* aria-required, not required: the action above already asks for the receipt with a clear
              message, and native validation of file inputs varies between browsers. */}
          <input
            id="receipt"
            name="receipt"
            type="file"
            accept="image/*,application/pdf"
            aria-required={receiptRequired}
          />
          {state.status === 'error' ? (
            <p role="alert" className="rounded-xl border border-accent bg-bg p-3 text-sm">
              {state.message}
            </p>
          ) : null}
          <Button type="submit" fullWidth disabled={pending}>
            {pending ? 'Enviando…' : 'Informar transferencia'}
          </Button>
        </form>
      </div>
    </BottomSheet>
  )
}

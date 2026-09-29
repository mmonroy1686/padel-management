'use client'

import { useState } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, inputClasses } from '@/components/ui/field'
import { formatPrice } from '@/lib/domain/format'

export type TransferView = {
  id: string
  amount: number
  holder: string
  when: string
  courtName: string
  receiptUrl: string | null
}

export function TransferReviewCard({
  transfer,
  confirmAction,
  rejectAction,
}: {
  transfer: TransferView
  confirmAction: FormAction
  rejectAction: FormAction
}) {
  const [rejecting, setRejecting] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  if (done) {
    return (
      <Card>
        <p role="status">{done}</p>
      </Card>
    )
  }

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <p className="font-semibold">{transfer.holder}</p>
        <p className="text-fg-muted">
          {transfer.when}, {transfer.courtName}
        </p>
        <p className="font-display text-2xl font-bold">{formatPrice(transfer.amount)}</p>
      </div>
      {transfer.receiptUrl ? (
        <a href={transfer.receiptUrl} target="_blank" rel="noreferrer" className="font-semibold text-accent-ink underline">
          Ver comprobante
        </a>
      ) : (
        <p className="text-sm text-fg-muted">Sin comprobante</p>
      )}
      <ActionForm action={confirmAction} submitLabel="Confirmar" pendingLabel="Confirmando…" onDone={setDone}>
        <input type="hidden" name="paymentId" value={transfer.id} />
      </ActionForm>
      {rejecting ? (
        <ActionForm action={rejectAction} submitLabel="Rechazar transferencia" variant="secondary" onDone={setDone}>
          <input type="hidden" name="paymentId" value={transfer.id} />
          <Field label="Motivo" htmlFor={`reason-${transfer.id}`}>
            <input
              id={`reason-${transfer.id}`}
              name="reason"
              maxLength={120}
              placeholder="Ej: No llegó a la cuenta"
              className={inputClasses}
            />
          </Field>
        </ActionForm>
      ) : (
        <Button variant="ghost" onClick={() => setRejecting(true)}>
          Rechazar
        </Button>
      )}
    </Card>
  )
}

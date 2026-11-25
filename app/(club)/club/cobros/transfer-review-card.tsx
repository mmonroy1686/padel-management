'use client'

import { useState } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, inputClasses } from '@/components/ui/field'
import { Icon } from '@/components/ui/icon'
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
      <Card className="flex items-center gap-3">
        <Icon name="check-circle" className="text-court-ink" />
        <p role="status">{done}</p>
      </Card>
    )
  }

  return (
    <Card className="flex h-full flex-col gap-3">
      <PaymentItemHead holder={transfer.holder} when={transfer.when} courtName={transfer.courtName}
        amount={transfer.amount} amountLabel="Transfirió" />
      {transfer.receiptUrl ? (
        <a
          href={transfer.receiptUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center gap-2 self-start font-semibold text-accent-ink underline"
        >
          <Icon name="receipt" className="size-4" />
          Ver comprobante
        </a>
      ) : (
        <p className="flex min-h-11 items-center gap-2 text-sm text-fg-muted">
          <Icon name="receipt" className="size-4" />
          Sin comprobante
        </p>
      )}
      <ActionForm action={confirmAction} submitLabel="Confirmar" pendingLabel="Confirmando…" onDone={setDone}>
        <input type="hidden" name="paymentId" value={transfer.id} />
      </ActionForm>
      {rejecting ? (
        <ActionForm action={rejectAction} submitLabel="Rechazar transferencia" variant="danger" confirmLabel="¿Seguro? Tocá de nuevo" onDone={setDone}>
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

// Who, when, where and how much, at the top of the review.
function PaymentItemHead({ holder, when, courtName, amount, amountLabel }: {
  holder: string
  when: string
  courtName: string
  amount: number
  amountLabel: string
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-semibold">{holder}</p>
        <p className="flex items-center gap-1.5 text-sm text-fg-muted">
          <Icon name="calendar" className="size-4" />
          {when}
        </p>
        {courtName ? (
          <p className="flex items-center gap-1.5 text-sm text-fg-muted">
            <Icon name="pin" className="size-4" />
            {courtName}
          </p>
        ) : null}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs text-fg-muted">{amountLabel}</p>
        <p className="font-display text-2xl font-bold tabular-nums">{formatPrice(amount)}</p>
      </div>
    </div>
  )
}

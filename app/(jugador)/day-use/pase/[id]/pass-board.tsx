'use client'

import { useCallback, useState } from 'react'
import { PaymentBadge } from '@/components/booking/payment-badge'
import { TransferSheet, type ReportTransfer } from '@/components/booking/transfer-sheet'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { PASS_STATUS_LABELS, type DayUsePass } from '@/lib/domain/day-use'
import { formatPrice, timeIn } from '@/lib/domain/format'
import { rewardLabel } from '@/lib/domain/loyalty'
import type { EntryPaymentView } from '@/lib/domain/tournament-payments'

export type PassBoardProps = {
  pass: DayUsePass
  viewerId: string
  qrSvg: string
  whenText: string
  timezone: string
  payment: EntryPaymentView
  paymentNote: string
  transfer: { details: string | null; receiptRequired: boolean }
  canCancel: boolean
  cancelAction: FormAction
  reportAction: ReportTransfer
}

type Sheet = 'cancel' | 'transfer'

// Design: "/day-use/pase/[id]". Reception scans the QR (it opens the pass in the club panel) or
// looks the player up by name.
export function PassBoard(props: PassBoardProps) {
  const { pass, payment } = props
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const close = useCallback(() => setSheet(null), [])
  const done = useCallback((message: string) => {
    setSheet(null)
    setNotice(message)
  }, [])
  const free = pass.total === 0
  const price = pass.usedReward
    ? `${formatPrice(pass.total)} (${rewardLabel(pass.discountPercent)} con tu recompensa)`
    : formatPrice(pass.total)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-display text-3xl font-bold uppercase">{pass.productName}</h1>
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-semibold">
          {PASS_STATUS_LABELS[pass.status]}
        </span>
      </div>
      {notice ? (
        <p role="status" className="rounded-xl border border-accent bg-surface p-3">
          {notice}
        </p>
      ) : null}
      {pass.status !== 'cancelled' ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-white p-4">
          {/* Our own SVG, drawn on the server by lib/qr/pass-qr.ts from the pass code. */}
          <div
            role="img"
            aria-label="Código QR del pase"
            className="w-full max-w-64 [&>svg]:h-auto [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: props.qrSvg }}
          />
          <p data-testid="pass-code" className="font-display text-3xl font-bold tracking-widest text-black">
            {pass.code}
          </p>
          <p className="text-center text-sm text-black">Mostralo en recepción al llegar: lo escanean o te buscan por nombre.</p>
        </div>
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-fg-muted">Cuándo</dt>
        <dd>{props.whenText}</dd>
        <dt className="text-fg-muted">Precio</dt>
        <dd>{price}</dd>
      </dl>
      {pass.status === 'cancelled' ? null : free ? (
        <p className="rounded-xl border border-border p-3">Sin costo: usaste tu recompensa.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
          <span className="font-semibold">Tu pago</span>
          <PaymentBadge state={payment.state} />
          {payment.canReportTransfer ? (
            <Button variant="secondary" onClick={() => setSheet('transfer')}>
              Ya transferí
            </Button>
          ) : null}
          {payment.state === 'pending' ? <p className="w-full text-sm text-fg-muted">{props.paymentNote}</p> : null}
          {payment.rejectionReason ? (
            <p className="w-full text-sm">El club rechazó la transferencia: {payment.rejectionReason}.</p>
          ) : null}
        </div>
      )}
      {pass.status === 'inside' ? (
        <p role="note" className="rounded-xl border border-court-ink p-3">
          Ya registraste el ingreso{pass.checkedInAt ? ` a las ${timeIn(pass.checkedInAt, props.timezone)}` : ''}. ¡Que lo disfrutes!
        </p>
      ) : null}
      {pass.status === 'cancelled' ? (
        <p role="note" className="rounded-xl border border-border p-3">
          Este pase está cancelado.
        </p>
      ) : null}
      {props.canCancel ? (
        <Button variant="ghost" onClick={() => setSheet('cancel')}>
          Cancelar pase
        </Button>
      ) : null}

      <BottomSheet open={sheet === 'cancel'} onClose={close} title="Cancelar pase">
        <p className="mb-4">
          Tu lugar queda libre.
          {pass.usedReward ? ' Recuperás tu recompensa.' : ''}
          {payment.state === 'paid' && !free ? ' Ya pagaste: el club te devuelve la plata.' : ''}
        </p>
        <ActionForm action={props.cancelAction} submitLabel="Sí, cancelar" pendingLabel="Cancelando…" onDone={done}>
          <input type="hidden" name="passId" value={pass.id} />
        </ActionForm>
      </BottomSheet>
      {sheet === 'transfer' ? (
        <TransferSheet
          bookingId={pass.id}
          userId={props.viewerId}
          amount={payment.due}
          details={props.transfer.details}
          receiptRequired={props.transfer.receiptRequired}
          reportAction={props.reportAction}
          onClose={close}
          onDone={done}
        />
      ) : null}
    </div>
  )
}

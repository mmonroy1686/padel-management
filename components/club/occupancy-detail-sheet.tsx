'use client'

import { PaymentBadge } from '@/components/booking/payment-badge'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Field, inputClasses } from '@/components/ui/field'
import { formatPrice, timeIn } from '@/lib/domain/format'
import { KIND_LABELS, type GridCell, type Occupancy } from '@/lib/domain/grid'
import type { LocalDate } from '@/lib/domain/time'

export type DetailActions = { cancel: FormAction; unblock: FormAction; cash: FormAction; endSeries: FormAction }

export function OccupancyDetailSheet({
  cell,
  occupancy,
  date,
  dayText,
  timezone,
  acceptsCash,
  actions,
  onClose,
  onDone,
}: {
  cell: GridCell
  occupancy: Occupancy
  date: LocalDate
  dayText: string
  timezone: string
  acceptsCash: boolean
  actions: DetailActions
  onClose: () => void
  onDone: (message: string) => void
}) {
  const { booking } = cell
  const kindLabel = KIND_LABELS[occupancy.kind]
  const title = booking?.holderName ?? occupancy.note ?? kindLabel
  const when = `${dayText}, ${timeIn(occupancy.startsAt, timezone)} a ${timeIn(occupancy.endsAt, timezone)}`
  const source = booking ? `, cargada ${booking.source === 'online' ? 'online' : 'en recepción'}` : ''

  return (
    <BottomSheet open onClose={onClose} title={title}>
      <div className="flex flex-col gap-4">
        <p className="text-fg-muted">
          {kindLabel}, {cell.court.name}, {when}
          {source}.
        </p>
        {cell.offGrid ? <p className="text-sm">No coincide con la grilla actual del club.</p> : null}
        {booking ? (
          <>
            <div className="flex items-center gap-3">
              <PaymentBadge state={booking.paymentState} />
              <span>{formatPrice(booking.price)}</span>
            </div>
            {acceptsCash && booking.amountDue > 0 ? (
              <ActionForm action={actions.cash} submitLabel="Cobrar en efectivo" pendingLabel="Registrando…" onDone={onDone}>
                <input type="hidden" name="bookingId" value={booking.id} />
                <Field label="Monto" htmlFor="amount">
                  <input
                    id="amount"
                    name="amount"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={booking.amountDue}
                    required
                    defaultValue={booking.amountDue}
                    className={inputClasses}
                  />
                </Field>
              </ActionForm>
            ) : null}
            <ActionForm
              action={actions.cancel}
              submitLabel="Cancelar reserva"
              pendingLabel="Cancelando…"
              variant="secondary"
              onDone={onDone}
            >
              <input type="hidden" name="bookingId" value={booking.id} />
            </ActionForm>
            {booking.seriesId ? (
              <ActionForm
                action={actions.endSeries}
                submitLabel="Terminar turno fijo desde esta fecha"
                pendingLabel="Terminando…"
                variant="ghost"
                onDone={onDone}
              >
                <input type="hidden" name="seriesId" value={booking.seriesId} />
                <input type="hidden" name="fromDate" value={date} />
                <p className="text-sm text-fg-muted">Cancela esta fecha y las siguientes de este turno fijo.</p>
              </ActionForm>
            ) : null}
          </>
        ) : null}
        {occupancy.kind === 'block' ? (
          <ActionForm
            action={actions.unblock}
            submitLabel="Liberar cancha"
            pendingLabel="Liberando…"
            variant="secondary"
            onDone={onDone}
          >
            <input type="hidden" name="occupancyId" value={occupancy.id} />
          </ActionForm>
        ) : null}
      </div>
    </BottomSheet>
  )
}

'use client'

import Link from 'next/link'
import { PaymentBadge } from '@/components/booking/payment-badge'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Field, inputClasses } from '@/components/ui/field'
import { formatPrice, timeIn } from '@/lib/domain/format'
import { KIND_LABELS, type GridBooking, type GridCell, type Occupancy } from '@/lib/domain/grid'
import type { LocalDate } from '@/lib/domain/time'
import { CancelMatchForm, RemovePlayerForm } from './match-staff-actions'

export type DetailActions = {
  cancel: FormAction
  unblock: FormAction
  cash: FormAction
  endSeries: FormAction
  cancelMatch: FormAction
  removeFromMatch: FormAction
  release: FormAction
}

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
        {occupancy.tournamentId ? (
          <Link href={`/club/torneos/${occupancy.tournamentId}`} className="font-semibold text-accent-ink underline">
            Gestionar torneo
          </Link>
        ) : null}
        {booking?.matchId ? (
          <MatchBookingDetail booking={booking} acceptsCash={acceptsCash} actions={actions} onDone={onDone} />
        ) : booking ? (
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
        {occupancy.kind === 'hold' ? (
          <>
            <p>
              Retenido para {occupancy.note ?? 'el primero de la lista de espera'}
              {occupancy.expiresAt ? ` hasta las ${timeIn(occupancy.expiresAt, timezone)}` : ''}. Si no lo reserva a tiempo,
              pasa al siguiente.
            </p>
            <ActionForm
              action={actions.release}
              submitLabel="Pasar al siguiente"
              pendingLabel="Pasando…"
              variant="secondary"
              onDone={onDone}
            >
              <input type="hidden" name="occupancyId" value={occupancy.id} />
            </ActionForm>
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

function MatchBookingDetail({
  booking,
  acceptsCash,
  actions,
  onDone,
}: {
  booking: GridBooking
  acceptsCash: boolean
  actions: DetailActions
  onDone: (message: string) => void
}) {
  const matchId = booking.matchId ?? ''
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <PaymentBadge state={booking.paymentState} />
        <span>{formatPrice(booking.price)}, cada jugador paga su parte</span>
      </div>
      <ul className="flex flex-col gap-2">
        {(booking.matchPlayers ?? []).map((player) => (
          <li key={player.playerId} className="flex flex-col gap-2 rounded-xl border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{player.name}</span>
              <PaymentBadge state={player.state} />
            </div>
            <p className="text-sm text-fg-muted">
              Parte {formatPrice(player.share)}
              {player.due > 0 ? `, debe ${formatPrice(player.due)}` : ''}
            </p>
            {acceptsCash && player.due > 0 ? (
              <ActionForm
                action={actions.cash}
                submitLabel={`Cobrar ${formatPrice(player.due)}`}
                pendingLabel="Registrando…"
                variant="secondary"
                onDone={onDone}
              >
                <input type="hidden" name="bookingId" value={booking.id} />
                <input type="hidden" name="payerId" value={player.playerId} />
                <input type="hidden" name="amount" value={player.due} />
              </ActionForm>
            ) : null}
            <RemovePlayerForm matchId={matchId} playerId={player.playerId} action={actions.removeFromMatch} onDone={onDone} />
          </li>
        ))}
      </ul>
      <CancelMatchForm matchId={matchId} action={actions.cancelMatch} onDone={onDone} />
    </div>
  )
}

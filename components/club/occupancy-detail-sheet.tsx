'use client'

import Link from 'next/link'
import { PaymentBadge } from '@/components/booking/payment-badge'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { formatPrice, timeIn } from '@/lib/domain/format'
import { KIND_LABELS, type GridBooking, type GridCell, type Occupancy } from '@/lib/domain/grid'
import type { MemberOption } from '@/lib/domain/members'
import type { LocalDate } from '@/lib/domain/time'
import { BookingPlayers, type PlayersActions } from './booking-players'
import type { PayMethods } from './charge-choice'
import { CancelMatchForm, RemovePlayerForm } from './match-staff-actions'

export type DetailActions = PlayersActions & {
  cancel: FormAction
  unblock: FormAction
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
  methods,
  members,
  actions,
  onClose,
  onDone,
}: {
  cell: GridCell
  occupancy: Occupancy
  date: LocalDate
  dayText: string
  timezone: string
  methods: PayMethods
  members: MemberOption[]
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
        {occupancy.championshipId ? (
          <Link href={`/club/torneos/campeonatos/${occupancy.championshipId}`} className="font-semibold text-accent-ink underline">
            Gestionar campeonato
          </Link>
        ) : null}
        {booking?.matchId ? (
          <MatchBookingDetail booking={booking} methods={methods} members={members} actions={actions} onDone={onDone} />
        ) : booking ? (
          <>
            <div className="flex items-center gap-3">
              <PaymentBadge state={booking.paymentState} />
              <span>{formatPrice(booking.price)}</span>
            </div>
            {booking.turn ? (
              <BookingPlayers
                bookingId={booking.id}
                turn={booking.turn}
                methods={methods}
                members={members}
                actions={actions}
                onDone={onDone}
              />
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
  methods,
  members,
  actions,
  onDone,
}: {
  booking: GridBooking
  methods: PayMethods
  members: MemberOption[]
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
      {booking.turn ? (
        <BookingPlayers
          bookingId={booking.id}
          turn={booking.turn}
          methods={methods}
          members={members}
          actions={actions}
          onDone={onDone}
          playerExtra={(player) =>
            player.playerId ? (
              <RemovePlayerForm matchId={matchId} playerId={player.playerId} action={actions.removeFromMatch} onDone={onDone} />
            ) : null
          }
        />
      ) : null}
      <CancelMatchForm matchId={matchId} action={actions.cancelMatch} onDone={onDone} />
    </div>
  )
}

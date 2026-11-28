import type { FormAction } from '@/components/ui/action-form'
import { shortDate, timeIn } from '@/lib/domain/format'
import { hasFourPlayers, type PlayedBooking } from '@/lib/domain/booking-result'
import { localDateOf } from '@/lib/domain/time'
import { ResultEditor } from './result-editor'

// The player's played bookings: when and where, who played, and the result or the way to load it.
export function PlayedList({
  played,
  timezone,

  saveAction,
  clearAction,
}: {
  played: PlayedBooking[]
  timezone: string

  saveAction: FormAction
  clearAction: FormAction
}) {
  return (
    <ul aria-label="Partidos jugados" className="flex flex-col divide-y divide-border">
      {played.map((booking) => {
        const me = booking.players.find((player) => player.isMe)
        const others = booking.players.filter((player) => !player.isMe).map((player) => player.name)
        return (
          <li key={booking.bookingId} className="flex flex-col gap-2 py-4">
            <div>
              <p className="font-semibold">
                {shortDate(localDateOf(booking.startsAt, timezone))} {timeIn(booking.startsAt, timezone)} · {booking.courtName}
              </p>
              {others.length > 0 ? <p className="text-sm text-fg-muted">Con {others.join(', ')}</p> : null}
            </div>
            {me && hasFourPlayers(booking.players) ? (
              <ResultEditor
                bookingId={booking.bookingId}
                players={booking.players}
                anchor={me.position}
                result={booking.result}
                saveAction={saveAction}
                clearAction={clearAction}
              />
            ) : (
              <p className="text-sm text-fg-muted">Sin los 4 jugadores cargados: no se puede anotar el resultado.</p>
            )}
          </li>
        )
      })}
    </ul>
  )
}

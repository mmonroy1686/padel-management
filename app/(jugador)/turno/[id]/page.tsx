import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { ShareTransfer } from '@/components/booking/share-transfer'
import { WhatsappShareLink } from '@/components/booking/whatsapp-share-link'
import { reportTransfer } from '@/app/(jugador)/reservas/actions'
import { ActionForm } from '@/components/ui/action-form'
import { Card } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { requestOrigin } from '@/lib/auth/request-origin'
import { requirePlayer } from '@/lib/auth/viewer'
import { bookingShareText, bookingShareUrl } from '@/lib/domain/booking-share'
import { capitalize, dayLongLabel, formatPrice, timeIn } from '@/lib/domain/format'
import { isUuid } from '@/lib/domain/input'
import { localDateOf } from '@/lib/domain/time'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/cn'
import { joinBooking } from './actions'

export const metadata: Metadata = { title: 'Turno', robots: { index: false } }

type Params = Promise<{ id: string }>

// A booking shared by WhatsApp to fill it: who plays and, while there is room, «Me sumo». Its players share it from
// here too. An open match has its own page.
export default async function SharedBookingPage({ params }: { params: Params }) {
  const { id } = await params
  if (!isUuid(id)) notFound()
  const viewer = await requirePlayer(`/turno/${id}`)
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('booking_invite', { p_booking_id: id })
  if (error?.message === 'not_found') notFound()
  if (error) throw error
  const booking = data?.[0]
  if (!booking) notFound()
  if (booking.match_id) redirect(`/partidos/${booking.match_id}`)

  const { club } = viewer
  const startsAt = new Date(booking.starts_at)
  const day = capitalize(dayLongLabel(localDateOf(startsAt, club.timezone)))
  const time = timeIn(startsAt, club.timezone)
  const players = (booking.players as { position: number; name: string }[]) ?? []
  const over = booking.status !== 'confirmed' || startsAt <= new Date()
  const text = bookingShareText({
    clubName: club.name,
    dayText: day,
    time,
    courtName: booking.court_name,
    free: booking.free,
    url: bookingShareUrl(await requestOrigin(), id),
  })

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-4xl font-bold uppercase">
          {booking.free === 0 ? 'Turno completo' : booking.free === 1 ? 'Falta 1' : `Faltan ${booking.free}`}
        </h1>
        <p className="text-lg">
          {day}, {time} a {timeIn(new Date(booking.ends_at), club.timezone)}
        </p>
        <p className="text-fg-muted">
          {club.name}, {booking.court_name} · {formatPrice(booking.share)} por persona
        </p>
      </div>

      <Card className="flex flex-col gap-3">
        <p className="text-sm font-semibold">Juegan</p>
        <ul aria-label="Jugadores" className="grid grid-cols-2 gap-2">
          {[1, 2, 3, 4].map((position) => {
            const player = players.find((item) => item.position === position)
            return (
              <li
                key={position}
                className={cn(
                  'flex min-h-14 items-center gap-2 rounded-xl px-3',
                  player ? 'bg-bg ring-1 ring-border' : 'border-2 border-dashed border-court-ink text-court-ink',
                )}
              >
                <Icon name={player ? 'user' : 'users'} className="size-5 shrink-0" />
                <span className="min-w-0 break-words font-semibold leading-tight">{player ? player.name : 'Lugar libre'}</span>
              </li>
            )
          })}
        </ul>
      </Card>

      {over ? (
        <p className="text-fg-muted">Este turno ya no está disponible.</p>
      ) : booking.is_participant ? (
        <div className="flex flex-col gap-2">
          <p>Estás en este turno.{booking.free > 0 ? ' Compartilo para completarlo.' : ''}</p>
          {booking.free > 0 ? <WhatsappShareLink text={text} size="md" /> : null}
          {/* Most pay at the club; a transfer of their own share is there for whoever prefers it. */}
          {booking.accepts_transfer && booking.my_left !== null && booking.my_left > 0 ? (
            <ShareTransfer
              bookingId={id}
              userId={viewer.userId}
              amount={booking.my_left}
              details={club.transfer_details}
              receiptRequired={club.transfer_receipt_required}
              reportAction={reportTransfer}
            />
          ) : null}
        </div>
      ) : booking.free > 0 ? (
        <ActionForm action={joinBooking} submitLabel="Me sumo" pendingLabel="Sumándote…">
          <input type="hidden" name="bookingId" value={id} />
        </ActionForm>
      ) : (
        <p className="text-fg-muted">El turno ya está completo.</p>
      )}
    </>
  )
}

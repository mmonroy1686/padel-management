import type { Metadata } from 'next'
import Link from 'next/link'
import { requirePlayer } from '@/lib/auth/viewer'
import { splitMyBookings, toMyBookingView, toMyMatchBookingView } from '@/lib/domain/my-bookings'
import { createClient } from '@/lib/supabase/server'
import { cancelMyBooking, reportTransfer } from './actions'
import { MyBookingCard } from './my-booking-card'

export const metadata: Metadata = { title: 'Mis reservas' }

export default async function MyBookingsPage() {
  const viewer = await requirePlayer('/reservas')
  const { club } = viewer
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('bookings')
    .select('id, starts_at, ends_at, price, status, court:courts(name), payments(status, amount, rejection_reason, created_at)')
    .eq('player_id', viewer.userId)
    .order('starts_at', { ascending: true })
  if (error) throw error

  const spots = await supabase.from('match_slots').select('position, match:open_matches(booking_id)').eq('player_id', viewer.userId)
  if (spots.error) throw spots.error
  const positionByBooking = new Map(
    spots.data.flatMap((spot) => (spot.match?.booking_id ? [[spot.match.booking_id, spot.position] as const] : [])),
  )
  const matchBookings =
    positionByBooking.size > 0
      ? await supabase
          .from('bookings')
          .select(
            'id, starts_at, ends_at, price, status, match_id, court:courts(name), payments(status, amount, rejection_reason, created_at, payer_id)',
          )
          .in('id', [...positionByBooking.keys()])
      : { data: [], error: null }
  if (matchBookings.error) throw matchBookings.error

  const now = new Date()
  const rows = [
    ...data.map((row) => ({ startsAt: row.starts_at ?? '', view: toMyBookingView(row, club, now) })),
    ...matchBookings.data.flatMap((row) =>
      row.match_id
        ? [
            {
              startsAt: row.starts_at ?? '',
              view: toMyMatchBookingView(
                { ...row, match_id: row.match_id },
                positionByBooking.get(row.id) ?? 2,
                viewer.userId,
                club,
                now,
              ),
            },
          ]
        : [],
    ),
  ].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
  const { upcoming, past } = splitMyBookings(rows.map((item) => item.view))
  const transfer = { details: club.transfer_details, receiptRequired: club.transfer_receipt_required }
  const card = (booking: (typeof upcoming)[number]) => (
    <li key={booking.id}>
      <MyBookingCard
        booking={booking}
        userId={viewer.userId}
        transfer={transfer}
        cancelAction={cancelMyBooking}
        reportAction={reportTransfer}
      />
    </li>
  )

  return (
    <>
      <h1 className="font-display text-4xl font-bold uppercase">Mis reservas</h1>
      <section aria-labelledby="proximas" className="flex flex-col gap-3">
        <h2 id="proximas" className="font-display text-2xl font-bold uppercase">
          Próximas
        </h2>
        {upcoming.length > 0 ? (
          <ul className="flex flex-col gap-3">{upcoming.map(card)}</ul>
        ) : (
          <p className="text-fg-muted">
            No tenés reservas.{' '}
            <Link href="/reservar" className="font-semibold text-accent-ink underline">
              Reservá una cancha
            </Link>
            .
          </p>
        )}
      </section>
      {past.length > 0 ? (
        <section aria-labelledby="pasadas" className="flex flex-col gap-3">
          <h2 id="pasadas" className="font-display text-2xl font-bold uppercase">
            Pasadas y canceladas
          </h2>
          <ul className="flex flex-col gap-3">{past.map(card)}</ul>
        </section>
      ) : null}
    </>
  )
}

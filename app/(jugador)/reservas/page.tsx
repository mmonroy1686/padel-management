import type { Metadata } from 'next'
import Link from 'next/link'
import { requirePlayer } from '@/lib/auth/viewer'
import { splitMyBookings, toMyBookingView } from '@/lib/domain/my-bookings'
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

  const now = new Date()
  const { upcoming, past } = splitMyBookings(data.map((row) => toMyBookingView(row, club, now)))
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

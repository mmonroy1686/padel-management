import type { Metadata } from 'next'
import { ActionForm } from '@/components/ui/action-form'
import { Card } from '@/components/ui/card'
import { requireStaff } from '@/lib/auth/viewer'
import { dayLongLabel, formatPrice, timeIn } from '@/lib/domain/format'
import { holderName } from '@/lib/domain/grid'
import { amountDue, paymentState } from '@/lib/domain/payments'
import { localDateOf, toDate } from '@/lib/domain/time'
import { createClient } from '@/lib/supabase/server'
import { recordCash } from '../grilla/actions'
import { confirmPayment, refundPayment, rejectPayment } from './actions'
import { TransferReviewCard, type TransferView } from './transfer-review-card'

export const metadata: Metadata = { title: 'Cobros' }

const BOOKING_FIELDS =
  'id, starts_at, price, status, guest_name, court:courts(name), player:profiles!bookings_player_id_fkey(display_name), payments(id, status, amount)'

export default async function PaymentsPage() {
  const viewer = await requireStaff('/club/cobros')
  const { club } = viewer
  const supabase = await createClient()
  const now = new Date()
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString()

  const [reported, played, cancelled] = await Promise.all([
    supabase
      .from('payments')
      .select(
        'id, amount, receipt_path, booking:bookings(starts_at, guest_name, court:courts(name), player:profiles!bookings_player_id_fkey(display_name))',
      )
      .eq('club_id', club.id)
      .eq('status', 'reported')
      .order('created_at'),
    supabase
      .from('bookings')
      .select(BOOKING_FIELDS)
      .eq('club_id', club.id)
      .eq('status', 'confirmed')
      .lt('ends_at', now.toISOString())
      .gt('ends_at', since)
      .order('starts_at', { ascending: false }),
    supabase
      .from('bookings')
      .select(BOOKING_FIELDS)
      .eq('club_id', club.id)
      .eq('status', 'cancelled')
      .gt('starts_at', since)
      .order('starts_at', { ascending: false }),
  ])
  if (reported.error) throw reported.error
  if (played.error) throw played.error
  if (cancelled.error) throw cancelled.error

  // Receipts are private: short-lived signed URLs, read with the staff session.
  const signedUrls = new Map<string, string>()
  const paths = reported.data.flatMap((payment) => (payment.receipt_path ? [payment.receipt_path] : []))
  if (paths.length > 0) {
    const { data: signed, error } = await supabase.storage.from('receipts').createSignedUrls(paths, 300)
    if (error) throw error
    for (const item of signed ?? []) if (item.path && item.signedUrl) signedUrls.set(item.path, item.signedUrl)
  }

  const when = (startsAt: string | null) => {
    const start = toDate(startsAt)
    return `${dayLongLabel(localDateOf(start, club.timezone))}, ${timeIn(start, club.timezone)}`
  }
  const transfers: TransferView[] = reported.data.map((payment) => ({
    id: payment.id,
    amount: payment.amount,
    holder: holderName(payment.booking?.guest_name ?? null, payment.booking?.player?.display_name ?? null) ?? 'Sin nombre',
    when: payment.booking ? when(payment.booking.starts_at) : '',
    courtName: payment.booking?.court?.name ?? '',
    receiptUrl: payment.receipt_path ? (signedUrls.get(payment.receipt_path) ?? null) : null,
  }))
  const unpaid = played.data.filter((booking) => paymentState(booking, booking.payments) === 'pending')
  const refunds = cancelled.data.flatMap((booking) =>
    booking.payments
      .filter((payment) => payment.status === 'confirmed')
      .map((payment) => ({ booking, payment })),
  )
  const holderOf = (booking: (typeof played.data)[number]) =>
    holderName(booking.guest_name, booking.player?.display_name ?? null) ?? 'Sin nombre'

  return (
    <>
      <section aria-labelledby="transferencias" className="flex flex-col gap-3">
        <h2 id="transferencias" className="font-display text-2xl font-bold uppercase">
          Transferencias para confirmar
        </h2>
        {transfers.length > 0 ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {transfers.map((transfer) => (
              <li key={transfer.id}>
                <TransferReviewCard transfer={transfer} confirmAction={confirmPayment} rejectAction={rejectPayment} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-fg-muted">No hay transferencias para confirmar.</p>
        )}
      </section>

      <section aria-labelledby="sin-pagar" className="flex flex-col gap-3">
        <h2 id="sin-pagar" className="font-display text-2xl font-bold uppercase">
          Reservas jugadas sin pagar
        </h2>
        {unpaid.length > 0 ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {unpaid.map((booking) => {
              const due = amountDue(booking.price, booking.payments)
              return (
                <li key={booking.id}>
                  <Card className="flex flex-col gap-2">
                    <p className="font-semibold">{holderOf(booking)}</p>
                    <p className="text-fg-muted">
                      {when(booking.starts_at)}, {booking.court?.name}. Debe {formatPrice(due)}.
                    </p>
                    {club.accepts_cash ? (
                      <ActionForm action={recordCash} submitLabel="Cobrar en efectivo" variant="secondary">
                        <input type="hidden" name="bookingId" value={booking.id} />
                        <input type="hidden" name="amount" value={due} />
                      </ActionForm>
                    ) : null}
                  </Card>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-fg-muted">Nada pendiente en los últimos 30 días.</p>
        )}
      </section>

      <section aria-labelledby="devolver" className="flex flex-col gap-3">
        <h2 id="devolver" className="font-display text-2xl font-bold uppercase">
          Pagos a devolver
        </h2>
        {refunds.length > 0 ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {refunds.map(({ booking, payment }) => (
              <li key={payment.id}>
                <Card className="flex flex-col gap-2">
                  <p className="font-semibold">{holderOf(booking)}</p>
                  <p className="text-fg-muted">
                    Canceló {when(booking.starts_at)}, {booking.court?.name}. Pagó {formatPrice(payment.amount)}.
                  </p>
                  <ActionForm action={refundPayment} submitLabel="Marcar devuelto" variant="secondary">
                    <input type="hidden" name="paymentId" value={payment.id} />
                  </ActionForm>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-fg-muted">No hay devoluciones pendientes.</p>
        )}
      </section>
    </>
  )
}

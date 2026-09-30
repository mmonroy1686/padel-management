import 'server-only'
import type { Club } from '@/lib/auth/viewer'
import {
  holderLabel,
  leftPlayerRefunds,
  refundsDue,
  unpaidBookings,
  type RefundItem,
  type UnpaidItem,
} from '@/lib/domain/payments-overview'
import { toDate } from '@/lib/domain/time'
import { createClient } from '@/lib/supabase/server'

export type ReportedTransfer = {
  id: string
  amount: number
  holder: string
  startsAt: Date | null
  courtName: string
  receiptUrl: string | null
}

export type PaymentsOverview = { transfers: ReportedTransfer[]; unpaid: UnpaidItem[]; refunds: RefundItem[] }

const RECEIPT_URL_SECONDS = 300

const BOOKING_SELECT =
  'id, starts_at, price, status, guest_name, match_id, court:courts(name), player:profiles!bookings_player_id_fkey(display_name), match:open_matches!bookings_match_id_fkey(slots:match_slots(position, player_id, player:profiles(display_name))), payments(id, status, amount, payer_id, payer:profiles!payments_payer_id_fkey(display_name))'

// Everything the Cobros screen needs, read with the staff session.
export async function loadPaymentsOverview(club: Club, now = new Date()): Promise<PaymentsOverview> {
  const supabase = await createClient()
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString()

  const [reported, played, cancelled, matchBookings] = await Promise.all([
    supabase
      .from('payments')
      .select(
        'id, amount, receipt_path, payer:profiles!payments_payer_id_fkey(display_name), booking:bookings(starts_at, guest_name, court:courts(name), player:profiles!bookings_player_id_fkey(display_name))',
      )
      .eq('club_id', club.id)
      .eq('status', 'reported')
      .order('created_at'),
    supabase
      .from('bookings')
      .select(BOOKING_SELECT)
      .eq('club_id', club.id)
      .eq('status', 'confirmed')
      .lt('ends_at', now.toISOString())
      .gt('ends_at', since)
      .order('starts_at', { ascending: false }),
    supabase
      .from('bookings')
      .select(BOOKING_SELECT)
      .eq('club_id', club.id)
      .eq('status', 'cancelled')
      .gt('starts_at', since)
      .order('starts_at', { ascending: false }),
    supabase
      .from('bookings')
      .select(BOOKING_SELECT)
      .eq('club_id', club.id)
      .eq('status', 'confirmed')
      .not('match_id', 'is', null)
      .gt('starts_at', since),
  ])
  if (reported.error) throw reported.error
  if (played.error) throw played.error
  if (cancelled.error) throw cancelled.error
  if (matchBookings.error) throw matchBookings.error

  // Receipts are private: short-lived signed URLs, made with the staff session.
  const signedUrls = new Map<string, string>()
  const paths = reported.data.flatMap((payment) => (payment.receipt_path ? [payment.receipt_path] : []))
  if (paths.length > 0) {
    const { data: signed, error } = await supabase.storage.from('receipts').createSignedUrls(paths, RECEIPT_URL_SECONDS)
    if (error) throw error
    for (const item of signed ?? []) if (item.path && item.signedUrl) signedUrls.set(item.path, item.signedUrl)
  }

  return {
    transfers: reported.data.map((payment) => ({
      id: payment.id,
      amount: payment.amount,
      holder: payment.payer?.display_name ?? (payment.booking ? holderLabel(payment.booking) : 'Sin nombre'),
      startsAt: payment.booking ? toDate(payment.booking.starts_at) : null,
      courtName: payment.booking?.court?.name ?? '',
      receiptUrl: payment.receipt_path ? (signedUrls.get(payment.receipt_path) ?? null) : null,
    })),
    unpaid: unpaidBookings(played.data),
    refunds: [...refundsDue(cancelled.data), ...leftPlayerRefunds(matchBookings.data)],
  }
}

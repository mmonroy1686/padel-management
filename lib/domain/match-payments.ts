import { amountDue, paymentState, type PaymentState, type PaymentStatus } from './payments'

export type SharePayment = { payer_id: string | null; status: PaymentStatus; amount: number }
export type SlotHolder = { position: number; player_id: string | null; player: { display_name: string } | null }
export type MatchPlayerPayment = {
  playerId: string
  name: string
  position: number
  share: number
  due: number
  state: PaymentState
}

// Same as private.match_share: price / 4, the remainder on spot 1.
export function shareFor(price: number, position: number): number {
  return Math.floor(price / 4) + (position === 1 ? price % 4 : 0)
}

// Each player's share of a match booking, from his own payments only.
export function matchPlayerPayments(
  booking: { price: number; status: 'confirmed' | 'cancelled' },
  slots: SlotHolder[],
  payments: SharePayment[],
): MatchPlayerPayment[] {
  return [...slots]
    .sort((a, b) => a.position - b.position)
    .flatMap((slot) => {
      if (!slot.player_id) return []
      const playerId = slot.player_id
      const share = shareFor(booking.price, slot.position)
      const own = payments.filter((payment) => payment.payer_id === playerId)
      return [
        {
          playerId,
          name: slot.player?.display_name ?? 'Jugador',
          position: slot.position,
          share,
          due: amountDue(share, own),
          state: paymentState({ price: share, status: booking.status }, own),
        },
      ]
    })
}

export type PaymentStatus = 'reported' | 'confirmed' | 'rejected' | 'refunded'
export type PaymentState = 'paid' | 'reported' | 'pending' | 'refund_due' | 'none'
export type PaymentLike = { status: PaymentStatus; amount: number }
export type BookingLike = { price: number; status: 'confirmed' | 'cancelled' }

export const PAYMENT_LABELS: Record<PaymentState, string> = {
  paid: 'Pagada',
  reported: 'Transferencia informada',
  pending: 'Pendiente de pago',
  refund_due: 'A devolver',
  none: 'Sin pagos',
}

function confirmedTotal(payments: PaymentLike[]): number {
  return payments.filter((p) => p.status === 'confirmed').reduce((sum, p) => sum + p.amount, 0)
}

// Same rule as the database: a booking is pending while its confirmed payments do not add up to its price.
export function amountDue(price: number, payments: PaymentLike[]): number {
  return Math.max(0, price - confirmedTotal(payments))
}

export function paymentState(booking: BookingLike, payments: PaymentLike[]): PaymentState {
  const confirmed = confirmedTotal(payments)
  if (booking.status === 'cancelled') return confirmed > 0 ? 'refund_due' : 'none'
  if (confirmed >= booking.price) return 'paid'
  if (payments.some((p) => p.status === 'reported')) return 'reported'
  return 'pending'
}

export function paymentMethodsNote(club: { accepts_cash: boolean; accepts_transfer: boolean }): string {
  if (club.accepts_cash && club.accepts_transfer) return 'Se paga en el club o por transferencia.'
  if (club.accepts_transfer) return 'Se paga por transferencia.'
  return 'Se paga en el club.'
}

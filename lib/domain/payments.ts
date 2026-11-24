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

// How a player pays this club, for the screens that tell him. POS is paid at the desk, like cash.
export function paymentMethodsNote(club: { accepts_cash: boolean; accepts_transfer: boolean; accepts_card: boolean }): string {
  const atDesk = club.accepts_cash
    ? club.accepts_card
      ? 'en el club (efectivo o tarjeta)'
      : 'en el club'
    : club.accepts_card
      ? 'en el club con tarjeta'
      : null
  if (atDesk && club.accepts_transfer) return `Se paga ${atDesk} o por transferencia.`
  if (club.accepts_transfer) return 'Se paga por transferencia.'
  return `Se paga ${atDesk ?? 'en el club'}.`
}

export type PaymentMethod = 'cash' | 'transfer' | 'card'
// What reception takes at the desk, confirmed at once and without a receipt. A transfer is reported by the player.
export type DeskMethod = Exclude<PaymentMethod, 'transfer'>
export const DESK_METHODS = ['cash', 'card'] as const satisfies readonly DeskMethod[]

// How a payment moved, in Cobros and in its done rows. "POS" is what the desk calls a card.
export const METHOD_LABELS: Record<PaymentMethod, string> = { cash: 'Efectivo', transfer: 'Transferencia', card: 'POS' }
// After "Cobramos $400 …".
export const METHOD_HOW: Record<PaymentMethod, string> = { cash: 'en efectivo', transfer: 'por transferencia', card: 'con POS' }

type ClubMethods = { accepts_cash: boolean; accepts_transfer: boolean; accepts_card: boolean }

// The desk buttons a club shows, in this order: Efectivo, POS.
export function deskMethods(club: Pick<ClubMethods, 'accepts_cash' | 'accepts_card'>): DeskMethod[] {
  return DESK_METHODS.filter((method) => (method === 'cash' ? club.accepts_cash : club.accepts_card))
}

// The desk method a form sends: cash when it sends none (the forms before POS), null when it is not a desk method.
export function readDeskMethod(form: FormData): DeskMethod | null {
  const raw = form.get('method')
  if (raw === null) return 'cash'
  return (DESK_METHODS as readonly unknown[]).includes(raw) ? (raw as DeskMethod) : null
}

// What the desk button says: just "Cobrar $400" when there is one way to pay, "… en efectivo" / "… con POS" when
// reception has to pick.
export function deskChargeLabel(base: string, method: DeskMethod, methods: readonly DeskMethod[]): string {
  if (methods.length > 1) return `${base} ${METHOD_HOW[method]}`
  return method === 'cash' ? base : `${base} ${METHOD_HOW[method]}`
}

export function deskChargeDone(method: DeskMethod): string {
  return method === 'cash' ? 'Pago en efectivo registrado.' : 'Pago con POS registrado.'
}

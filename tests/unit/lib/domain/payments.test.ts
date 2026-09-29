import { describe, expect, it } from 'vitest'
import { amountDue, PAYMENT_LABELS, paymentMethodsNote, paymentState } from '@/lib/domain/payments'

const booking = { price: 1200, status: 'confirmed' as const }

describe('paymentState', () => {
  it('is pending with nothing paid', () => {
    expect(paymentState(booking, [])).toBe('pending')
  })

  it('is reported while a transfer waits for the club', () => {
    expect(paymentState(booking, [{ status: 'reported', amount: 1200 }])).toBe('reported')
  })

  it('is paid once confirmed payments cover the price', () => {
    expect(paymentState(booking, [
      { status: 'confirmed', amount: 600 },
      { status: 'confirmed', amount: 600 },
    ])).toBe('paid')
  })

  it('stays pending after a rejection or a refund', () => {
    expect(paymentState(booking, [{ status: 'rejected', amount: 1200 }])).toBe('pending')
    expect(paymentState(booking, [{ status: 'refunded', amount: 1200 }])).toBe('pending')
  })

  it('asks for a refund when a paid booking is cancelled', () => {
    expect(paymentState({ price: 1200, status: 'cancelled' }, [{ status: 'confirmed', amount: 1200 }])).toBe('refund_due')
  })

  it('has nothing left to do for a cancelled unpaid booking', () => {
    expect(paymentState({ price: 1200, status: 'cancelled' }, [])).toBe('none')
  })

  it('has a Spanish label for every state', () => {
    expect(PAYMENT_LABELS).toEqual({
      paid: 'Pagada',
      reported: 'Transferencia informada',
      pending: 'Pendiente de pago',
      refund_due: 'A devolver',
      none: 'Sin pagos',
    })
  })
})

describe('amountDue', () => {
  it('subtracts only confirmed payments', () => {
    expect(amountDue(1600, [{ status: 'confirmed', amount: 600 }, { status: 'reported', amount: 1000 }])).toBe(1000)
  })

  it('never goes below zero', () => {
    expect(amountDue(1200, [{ status: 'confirmed', amount: 1500 }])).toBe(0)
  })
})

describe('paymentMethodsNote', () => {
  it('tells the player how to pay', () => {
    expect(paymentMethodsNote({ accepts_cash: true, accepts_transfer: true })).toBe('Se paga en el club o por transferencia.')
    expect(paymentMethodsNote({ accepts_cash: true, accepts_transfer: false })).toBe('Se paga en el club.')
    expect(paymentMethodsNote({ accepts_cash: false, accepts_transfer: true })).toBe('Se paga por transferencia.')
  })
})

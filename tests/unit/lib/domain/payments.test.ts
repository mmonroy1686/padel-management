import { describe, expect, it } from 'vitest'
import {
  amountDue,
  deskChargeDone,
  deskChargeLabel,
  deskMethods,
  PAYMENT_LABELS,
  paymentMethodsNote,
  paymentState,
  readDeskMethod,
} from '@/lib/domain/payments'

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
  const club = (cash: boolean, transfer: boolean, card = false) => ({ accepts_cash: cash, accepts_transfer: transfer, accepts_card: card })

  it('tells the player how to pay', () => {
    expect(paymentMethodsNote(club(true, true))).toBe('Se paga en el club o por transferencia.')
    expect(paymentMethodsNote(club(true, false))).toBe('Se paga en el club.')
    expect(paymentMethodsNote(club(false, true))).toBe('Se paga por transferencia.')
  })

  it('says a card works at the desk when the club has POS', () => {
    expect(paymentMethodsNote(club(true, true, true))).toBe('Se paga en el club (efectivo o tarjeta) o por transferencia.')
    expect(paymentMethodsNote(club(true, false, true))).toBe('Se paga en el club (efectivo o tarjeta).')
    expect(paymentMethodsNote(club(false, true, true))).toBe('Se paga en el club con tarjeta o por transferencia.')
    expect(paymentMethodsNote(club(false, false, true))).toBe('Se paga en el club con tarjeta.')
  })
})

describe('deskMethods', () => {
  it('lists what reception takes at the desk, cash first', () => {
    expect(deskMethods({ accepts_cash: true, accepts_card: true })).toEqual(['cash', 'card'])
    expect(deskMethods({ accepts_cash: true, accepts_card: false })).toEqual(['cash'])
    expect(deskMethods({ accepts_cash: false, accepts_card: true })).toEqual(['card'])
    expect(deskMethods({ accepts_cash: false, accepts_card: false })).toEqual([])
  })
})

describe('readDeskMethod', () => {
  const form = (method?: string) => {
    const data = new FormData()
    if (method !== undefined) data.set('method', method)
    return data
  }

  it('reads cash or card', () => {
    expect(readDeskMethod(form('card'))).toBe('card')
    expect(readDeskMethod(form('cash'))).toBe('cash')
  })

  it('refuses no method, a transfer or anything else: those are not desk charges', () => {
    expect(readDeskMethod(form())).toBeNull()
    expect(readDeskMethod(form('transfer'))).toBeNull()
    expect(readDeskMethod(form('bitcoin'))).toBeNull()
  })
})

describe('deskChargeLabel', () => {
  it('keeps "Cobrar $400" when cash is the only way, and says the method otherwise', () => {
    expect(deskChargeLabel('Cobrar $400', 'cash', ['cash'])).toBe('Cobrar $400')
    expect(deskChargeLabel('Cobrar $400', 'card', ['card'])).toBe('Cobrar $400 con POS')
    expect(deskChargeLabel('Cobrar $400', 'cash', ['cash', 'card'])).toBe('Cobrar $400 en efectivo')
    expect(deskChargeLabel('Cobrar $400', 'card', ['cash', 'card'])).toBe('Cobrar $400 con POS')
  })

  it('confirms with the method', () => {
    expect(deskChargeDone('cash')).toBe('Pago en efectivo registrado.')
    expect(deskChargeDone('card')).toBe('Pago con POS registrado.')
  })
})

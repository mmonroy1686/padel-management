import { describe, expect, it } from 'vitest'
import { describeDays, parseClubName, parseBookingSettings, parseClubPhone, parsePaymentSettings, parsePricingRule, TIME_OPTIONS } from '@/lib/domain/settings'

function form(entries: [string, string][]): FormData {
  const data = new FormData()
  for (const [key, value] of entries) data.append(key, value)
  return data
}

const BOOKING: [string, string][] = [
  ['opens_at', '08:00'],
  ['closes_at', '23:00'],
  ['slot_minutes', '90'],
  ['booking_window_days', '14'],
  ['cancellation_notice_hours', '24'],
  ['max_active_bookings', '2'],
  ['match_close_minutes', '180'],
]
const PAYMENTS: [string, string][] = [
  ['accepts_cash', 'on'],
  ['accepts_transfer', 'on'],
  ['transfer_receipt_required', 'on'],
  ['transfer_details', '  Banco Ejemplo, cuenta 123  '],
]
const replacing = (entries: [string, string][], key: string, value: string) => [
  ...entries.filter(([name]) => name !== key),
  [key, value] as [string, string],
]

describe('parseBookingSettings', () => {
  it('reads the hours and the booking rules', () => {
    expect(parseBookingSettings(form(BOOKING))).toEqual({
      ok: true,
      value: {
        opens_at: '08:00',
        closes_at: '23:00',
        slot_minutes: 90,
        booking_window_days: 14,
        cancellation_notice_hours: 24,
        max_active_bookings: 2,
        match_close_minutes: 180,
      },
    })
  })

  it('rejects closing before opening', () => {
    expect(parseBookingSettings(form(replacing(BOOKING, 'closes_at', '07:00')))).toEqual({
      ok: false,
      message: 'El club tiene que cerrar después de abrir.',
    })
  })

  it('rejects hours where not even one slot fits', () => {
    expect(parseBookingSettings(form(replacing(BOOKING, 'opens_at', '22:00')))).toEqual({
      ok: false,
      message: 'En ese horario no entra ni un turno.',
    })
  })

  it('takes the closing time of incomplete matches in minutes, up to 48 hours', () => {
    expect(parseBookingSettings(form(replacing(BOOKING, 'match_close_minutes', '30')))).toMatchObject({
      ok: true,
      value: { match_close_minutes: 30 },
    })
    expect(parseBookingSettings(form(replacing(BOOKING, 'match_close_minutes', '2881')))).toEqual({
      ok: false,
      message: 'Los minutos para cerrar partidos van de 0 a 2880 (48 h).',
    })
  })
})

describe('parsePaymentSettings', () => {
  it('reads the payment methods and the transfer details, trimmed', () => {
    expect(parsePaymentSettings(form(PAYMENTS))).toEqual({
      ok: true,
      value: {
        accepts_cash: true,
        accepts_transfer: true,
        transfer_receipt_required: true,
        transfer_details: 'Banco Ejemplo, cuenta 123',
      },
    })
  })

  it('needs at least one payment method', () => {
    const settings = PAYMENTS.filter(([name]) => name !== 'accepts_cash' && name !== 'accepts_transfer')
    expect(parsePaymentSettings(form(settings))).toEqual({ ok: false, message: 'Elegí al menos un medio de pago.' })
  })

  it('leaves the details empty when there are none', () => {
    expect(parsePaymentSettings(form(replacing(PAYMENTS, 'transfer_details', '   ')))).toMatchObject({
      ok: true,
      value: { transfer_details: null },
    })
  })
})

describe('parsePricingRule', () => {
  it('reads days, band and price', () => {
    const data = form([['weekdays', '5'], ['weekdays', '1'], ['weekdays', '1'], ['from_time', '18:30'], ['to_time', '24:00'], ['price', '1600']])
    expect(parsePricingRule(data)).toEqual({
      ok: true,
      value: { weekdays: [1, 5], from_time: '18:30', to_time: '24:00', price: 1600 },
    })
  })

  it('needs at least one day', () => {
    expect(parsePricingRule(form([['from_time', '08:00'], ['to_time', '12:00'], ['price', '1']]))).toEqual({
      ok: false,
      message: 'Elegí al menos un día.',
    })
  })
})

describe('describeDays', () => {
  it('names common day groups', () => {
    expect(describeDays([0, 1, 2, 3, 4, 5, 6])).toBe('Todos los días')
    expect(describeDays([1, 2, 3, 4, 5])).toBe('Lunes a viernes')
    expect(describeDays([0, 6])).toBe('Sábados y domingos')
    expect(describeDays([5, 1, 3])).toBe('lun, mié, vie')
  })
})

describe('TIME_OPTIONS', () => {
  it('goes from 00:00 to 24:00 every half hour', () => {
    expect(TIME_OPTIONS).toHaveLength(49)
    expect(TIME_OPTIONS[0]).toBe('00:00')
    expect(TIME_OPTIONS.at(-1)).toBe('24:00')
  })
})

describe('parseClubName', () => {
  const form = (name: string) => {
    const data = new FormData()
    data.set('name', name)
    return data
  }

  it('takes the name without the spaces around it', () => {
    expect(parseClubName(form('  Club Norte Pádel '))).toEqual({ ok: true, value: { name: 'Club Norte Pádel' } })
  })

  it('asks for a name of 2 to 40 letters', () => {
    expect(parseClubName(form(''))).toEqual({ ok: false, message: 'Escribí el nombre del club, de 2 a 40 letras.' })
    expect(parseClubName(form('A'))).toEqual({ ok: false, message: 'Escribí el nombre del club, de 2 a 40 letras.' })
    expect(parseClubName(form('x'.repeat(41)))).toEqual({ ok: false, message: 'Escribí el nombre del club, de 2 a 40 letras.' })
  })
})

describe('parseClubPhone', () => {
  const form = (phone: string) => {
    const data = new FormData()
    data.set('phone', phone)
    return data
  }

  it('keeps only the digits, the way the flyer reads them', () => {
    expect(parseClubPhone(form(' 092 369 558 '))).toEqual({ ok: true, value: { phone: '092369558' } })
    expect(parseClubPhone(form('+598 92 369 558'))).toEqual({ ok: true, value: { phone: '092369558' } })
  })

  it('clears it when left empty', () => {
    expect(parseClubPhone(form('  '))).toEqual({ ok: true, value: { phone: null } })
  })

  it('asks for 8 to 15 digits', () => {
    expect(parseClubPhone(form('123'))).toEqual({ ok: false, message: 'Revisá el teléfono: tiene que tener entre 8 y 15 números.' })
  })
})

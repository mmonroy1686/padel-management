import { describe, expect, it } from 'vitest'
import { describeDays, parseClubSettings, parsePricingRule, TIME_OPTIONS } from '@/lib/domain/settings'

function form(entries: [string, string][]): FormData {
  const data = new FormData()
  for (const [key, value] of entries) data.append(key, value)
  return data
}

const PROTOTYPE: [string, string][] = [
  ['opens_at', '08:00'],
  ['closes_at', '23:00'],
  ['slot_minutes', '90'],
  ['booking_window_days', '14'],
  ['cancellation_notice_hours', '24'],
  ['max_active_bookings', '2'],
  ['match_close_hours', '3'],
  ['accepts_cash', 'on'],
  ['accepts_transfer', 'on'],
  ['transfer_receipt_required', 'on'],
  ['transfer_details', '  Banco Ejemplo, cuenta 123  '],
]
const without = (key: string) => PROTOTYPE.filter(([name]) => name !== key)
const replacing = (key: string, value: string) => [...without(key), [key, value] as [string, string]]

describe('parseClubSettings', () => {
  it('reads the prototype settings', () => {
    expect(parseClubSettings(form(PROTOTYPE))).toEqual({
      ok: true,
      value: {
        opens_at: '08:00',
        closes_at: '23:00',
        slot_minutes: 90,
        booking_window_days: 14,
        cancellation_notice_hours: 24,
        max_active_bookings: 2,
        match_close_hours: 3,
        accepts_cash: true,
        accepts_transfer: true,
        transfer_receipt_required: true,
        transfer_details: 'Banco Ejemplo, cuenta 123',
      },
    })
  })

  it('rejects closing before opening', () => {
    expect(parseClubSettings(form(replacing('closes_at', '07:00')))).toEqual({
      ok: false,
      message: 'El club tiene que cerrar después de abrir.',
    })
  })

  it('rejects hours where not even one slot fits', () => {
    const settings = [...replacing('opens_at', '22:00')]
    expect(parseClubSettings(form(settings))).toEqual({ ok: false, message: 'En ese horario no entra ni un turno.' })
  })

  it('keeps the closing time of incomplete matches between 0 and 48 hours', () => {
    expect(parseClubSettings(form(replacing('match_close_hours', '49')))).toEqual({
      ok: false,
      message: 'Las horas para cerrar partidos van de 0 a 48.',
    })
  })

  it('needs at least one payment method', () => {
    const settings = without('accepts_cash').filter(([name]) => name !== 'accepts_transfer')
    expect(parseClubSettings(form(settings))).toEqual({ ok: false, message: 'Elegí al menos un medio de pago.' })
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

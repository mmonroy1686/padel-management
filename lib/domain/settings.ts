import { WEEKDAYS_SHORT } from './format'
import { readBoolean, readInt, readTime } from './input'
import { formatMinutes, parseTime } from './time'

export const SLOT_LENGTHS = [60, 90, 120] as const
export const TIME_OPTIONS: string[] = Array.from({ length: 49 }, (_, index) => formatMinutes(index * 30))

export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string }

export type ClubSettings = {
  opens_at: string
  closes_at: string
  slot_minutes: number
  booking_window_days: number
  cancellation_notice_hours: number
  max_active_bookings: number
  match_close_hours: number
  accepts_cash: boolean
  accepts_transfer: boolean
  transfer_receipt_required: boolean
  transfer_details: string | null
}

export type PricingRuleInput = { weekdays: number[]; from_time: string; to_time: string; price: number }

function fail(message: string): { ok: false; message: string } {
  return { ok: false, message }
}

// Same limits as the clubs check constraints, with a Spanish message for each.
export function parseClubSettings(form: FormData): ParseResult<ClubSettings> {
  const opensAt = readTime(form, 'opens_at')
  const closesAt = readTime(form, 'closes_at')
  if (!opensAt || !closesAt) return fail('Elegí el horario de apertura y de cierre.')
  if (parseTime(closesAt) <= parseTime(opensAt)) return fail('El club tiene que cerrar después de abrir.')

  const slotMinutes = readInt(form, 'slot_minutes', { min: 15, max: 240 })
  if (slotMinutes === null || !(SLOT_LENGTHS as readonly number[]).includes(slotMinutes)) {
    return fail('Elegí una duración de turno.')
  }
  if (parseTime(closesAt) - parseTime(opensAt) < slotMinutes) return fail('En ese horario no entra ni un turno.')

  const windowDays = readInt(form, 'booking_window_days', { min: 1, max: 60 })
  if (windowDays === null) return fail('Los días para reservar van de 1 a 60.')
  const noticeHours = readInt(form, 'cancellation_notice_hours', { min: 0, max: 72 })
  if (noticeHours === null) return fail('Las horas de aviso van de 0 a 72.')
  const maxActive = readInt(form, 'max_active_bookings', { min: 1, max: 10 })
  if (maxActive === null) return fail('Las reservas activas por jugador van de 1 a 10.')
  const matchCloseHours = readInt(form, 'match_close_hours', { min: 0, max: 48 })
  if (matchCloseHours === null) return fail('Las horas para cerrar partidos van de 0 a 48.')

  const acceptsCash = readBoolean(form, 'accepts_cash')
  const acceptsTransfer = readBoolean(form, 'accepts_transfer')
  if (!acceptsCash && !acceptsTransfer) return fail('Elegí al menos un medio de pago.')

  const rawDetails = form.get('transfer_details')
  const details = typeof rawDetails === 'string' ? rawDetails.trim() : ''
  if (details.length > 500) return fail('Los datos de transferencia tienen hasta 500 caracteres.')

  return {
    ok: true,
    value: {
      opens_at: opensAt,
      closes_at: closesAt,
      slot_minutes: slotMinutes,
      booking_window_days: windowDays,
      cancellation_notice_hours: noticeHours,
      max_active_bookings: maxActive,
      match_close_hours: matchCloseHours,
      accepts_cash: acceptsCash,
      accepts_transfer: acceptsTransfer,
      transfer_receipt_required: readBoolean(form, 'transfer_receipt_required'),
      transfer_details: details || null,
    },
  }
}

export function parsePricingRule(form: FormData): ParseResult<PricingRuleInput> {
  const weekdays = [...new Set(form.getAll('weekdays').map(Number))]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((a, b) => a - b)
  if (weekdays.length === 0) return fail('Elegí al menos un día.')

  const from = readTime(form, 'from_time')
  const to = readTime(form, 'to_time')
  if (!from || !to || parseTime(to) <= parseTime(from)) return fail('La franja tiene que terminar después de empezar.')

  const price = readInt(form, 'price', { min: 0, max: 10_000_000 })
  if (price === null) return fail('Ingresá el precio en pesos, sin puntos.')

  return { ok: true, value: { weekdays, from_time: from, to_time: to, price } }
}

const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0]

export function describeDays(weekdays: number[]): string {
  const days = new Set(weekdays)
  if (days.size === 7) return 'Todos los días'
  if (days.size === 5 && [1, 2, 3, 4, 5].every((day) => days.has(day))) return 'Lunes a viernes'
  if (days.size === 2 && days.has(0) && days.has(6)) return 'Sábados y domingos'
  return MONDAY_FIRST.filter((day) => days.has(day))
    .map((day) => WEEKDAYS_SHORT[day])
    .join(', ')
}

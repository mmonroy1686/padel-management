import { addDays, formatMinutes, minutesOfDay, parseLocalDate, weekdayOf, type LocalDate } from './time'

// Fixed Spanish names instead of Intl: the output is the same on every server and browser.
export const WEEKDAYS_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const
export const WEEKDAYS_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const
const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const

export function formatPrice(pesos: number): string {
  const sign = pesos < 0 ? '-' : ''
  const digits = String(Math.abs(Math.round(pesos))).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${sign}$${digits}`
}

export function dayLabel(date: LocalDate, today: LocalDate): string {
  if (date === today) return 'Hoy'
  if (date === addDays(today, 1)) return 'Mañana'
  return `${WEEKDAYS_SHORT[weekdayOf(date)]} ${parseLocalDate(date).day}`
}

export function dayLongLabel(date: LocalDate): string {
  const { day, month } = parseLocalDate(date)
  return `${WEEKDAYS_LONG[weekdayOf(date)]} ${day} de ${MONTHS[month - 1]}`
}

// month is 'YYYY-MM'.
export function monthLabel(month: string): string {
  const [year, number] = month.split('-').map(Number)
  const name = MONTHS[number - 1]
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`
}

export function timeIn(instant: Date, timeZone: string): string {
  return formatMinutes(minutesOfDay(instant, timeZone))
}

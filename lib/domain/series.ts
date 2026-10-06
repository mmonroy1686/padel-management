import { WEEKDAYS_SHORT } from './format'
import { addDays, parseLocalDate, weekdayOf, type LocalDate } from './time'

export type SkipReason = 'slot_taken' | 'no_price' | 'not_aligned' | 'court_inactive'

export const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  slot_taken: 'la cancha estaba ocupada',
  no_price: 'no había precio',
  not_aligned: 'el horario ya no está en la grilla',
  court_inactive: 'la cancha estaba desactivada',
}

export function shortDate(date: LocalDate): string {
  const { day, month } = parseLocalDate(date)
  return `${WEEKDAYS_SHORT[weekdayOf(date)]} ${day}/${month}`
}

function reasonLabel(reason: string): string {
  return Object.hasOwn(SKIP_REASON_LABELS, reason) ? SKIP_REASON_LABELS[reason as SkipReason] : reason
}

// What reception sees after loading a series: create_series returns the dates it skipped.
export function seriesCreatedMessage(skips: { on_date: string; reason: string }[]): string {
  if (skips.length === 0) return 'Turno fijo cargado para las próximas 8 semanas.'
  const dates = skips.map((skip) => `${shortDate(skip.on_date)} (${reasonLabel(skip.reason)})`).join(', ')
  return `Turno fijo cargado. Salteamos ${skips.length} ${skips.length === 1 ? 'fecha' : 'fechas'}: ${dates}.`
}

// The week of recurring slots for the calendar, Monday first (weekday 0 is Sunday) and by time.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

export function seriesByWeekday<T extends { weekday: number; startTime: string }>(
  series: T[],
): { weekday: number; items: T[] }[] {
  return WEEK_ORDER.map((weekday) => ({
    weekday,
    items: series.filter((item) => item.weekday === weekday).sort((a, b) => a.startTime.localeCompare(b.startTime)),
  }))
}

// The next date a recurring slot is played, today included.
export function nextOccurrence(weekday: number, today: LocalDate): LocalDate {
  return addDays(today, (weekday - weekdayOf(today) + 7) % 7)
}

// Court time the recurring slots hold every week.
export function weeklyMinutes(series: unknown[], slotMinutes: number): number {
  return series.length * slotMinutes
}

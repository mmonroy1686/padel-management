import type { OccupancyKind } from './grid'
import { addDays, localDateOf, weekdayOf, type LocalDate } from './time'

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

export function isMonth(value: unknown): value is string {
  return typeof value === 'string' && MONTH.test(value)
}

export function monthOf(date: LocalDate): string {
  return date.slice(0, 7)
}

export function addMonths(month: string, count: number): string {
  const [year, number] = month.split('-').map(Number)
  return new Date(Date.UTC(year, number - 1 + count, 1)).toISOString().slice(0, 7)
}

function mondayOf(date: LocalDate): LocalDate {
  return addDays(date, -((weekdayOf(date) + 6) % 7))
}

export function weekOf(date: LocalDate): LocalDate[] {
  const monday = mondayOf(date)
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index))
}

// Monday-first weeks that cover the whole month.
export function monthGrid(month: string): LocalDate[][] {
  const weeks: LocalDate[][] = []
  let monday = mondayOf(`${month}-01`)
  do {
    weeks.push(weekOf(monday))
    monday = addDays(monday, 7)
  } while (monthOf(monday) === month)
  return weeks
}

export type DaySummary = { occupied: number; recurring: number; percent: number }

// capacityPerDay = slots per day × active courts. A long block counts once.
export function summarizeDays(
  occupancies: { startsAt: Date; kind: OccupancyKind }[],
  timezone: string,
  capacityPerDay: number,
): Map<LocalDate, DaySummary> {
  const summary = new Map<LocalDate, DaySummary>()
  for (const occupancy of occupancies) {
    const day = localDateOf(occupancy.startsAt, timezone)
    const current = summary.get(day) ?? { occupied: 0, recurring: 0, percent: 0 }
    current.occupied += 1
    if (occupancy.kind === 'recurring') current.recurring += 1
    current.percent = capacityPerDay > 0 ? Math.min(100, Math.round((current.occupied / capacityPerDay) * 100)) : 0
    summary.set(day, current)
  }
  return summary
}

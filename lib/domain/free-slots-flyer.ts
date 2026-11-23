import { formatPhone, shortDate, WEEKDAYS_LONG } from './format'
import type { DayGrid } from './grid'
import { weekdayOf, type LocalDate } from './time'

// The "Turnos libres" flyer clubs post on WhatsApp: courts in columns, the day's times still to come in rows.
export type FlyerCell = 'free' | 'taken' | 'none'
export type FlyerLayout = {
  columns: { courtId: string; name: string }[]
  rows: { label: string; cells: FlyerCell[] }[]
  // From 6 courts the columns get narrow; past 8 times the pills get smaller.
  narrow: boolean
  compact: boolean
}

const NARROW_FROM_COURTS = 6
const COMPACT_PAST_TIMES = 8

export function flyerLayout(grid: DayGrid): FlyerLayout {
  const rows = grid.rows
    .filter((row) => !row.past)
    .map((row) => ({
      label: row.slot.label,
      cells: row.cells.map((cell): FlyerCell => {
        if (cell.state === 'free') return 'free'
        if (cell.state === 'mine' || cell.state === 'taken') return 'taken'
        return 'none'
      }),
    }))
  return {
    columns: grid.courts.map((court) => ({ courtId: court.id, name: court.name })),
    rows,
    narrow: grid.courts.length >= NARROW_FROM_COURTS,
    compact: rows.length > COMPACT_PAST_TIMES,
  }
}

export function hasFreeSlots(layout: FlyerLayout): boolean {
  return layout.rows.some((row) => row.cells.includes('free'))
}

// "lunes 24/11"
export function flyerDayText(date: LocalDate): string {
  return `${WEEKDAYS_LONG[weekdayOf(date)]} ${shortDate(date)}`
}

// The flyer's last line: the club's WhatsApp, or the app's link when it has none.
export function flyerContact(phone: string | null, url: string): string {
  return phone ? `Consultanos: ${formatPhone(phone)}` : url
}

// The same flyer as text, for WhatsApp: only the free times of each court.
export function flyerText(input: { date: LocalDate; layout: FlyerLayout; url: string; phone: string | null }): string {
  const { layout } = input
  const courts = layout.columns.flatMap((column, index) => {
    const times = layout.rows.filter((row) => row.cells[index] === 'free').map((row) => row.label)
    return times.length > 0 ? [`${column.name}: ${times.join(' · ')}`] : []
  })
  return [
    `🎾 Turnos libres — ${flyerDayText(input.date)}`,
    ...(courts.length > 0 ? courts : ['No quedan turnos libres este día.']),
    `Reservá: ${input.url}${input.phone ? ` · WhatsApp ${formatPhone(input.phone)}` : ''}`,
  ].join('\n')
}

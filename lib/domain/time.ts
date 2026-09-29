// The club's wall clock, with Intl only (no date library).
// A LocalDate is 'YYYY-MM-DD' on the club's calendar. Minutes count from local midnight;
// 1440 is the next midnight, so a club that closes at 24:00 fits.

export type LocalDate = string

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatters.set(timeZone, formatter)
  }
  return formatter
}

type WallClock = { year: number; month: number; day: number; hour: number; minute: number; second: number }

function wallClock(instant: Date, timeZone: string): WallClock {
  const parts = formatterFor(timeZone).formatToParts(instant)
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value)
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    hour: part('hour'),
    minute: part('minute'),
    second: part('second'),
  }
}

// How far the club's clock is ahead of UTC at that instant, in milliseconds.
function offsetMs(instant: Date, timeZone: string): number {
  const w = wallClock(instant, timeZone)
  const wallAsUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second)
  return wallAsUtc - Math.floor(instant.getTime() / 1000) * 1000
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function parseLocalDate(date: LocalDate): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) throw new Error(`Fecha inválida: ${date}`)
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

// The instant when the club's clock shows `date` at `minutes` after midnight.
export function zonedTime(date: LocalDate, minutes: number, timeZone: string): Date {
  const { year, month, day } = parseLocalDate(date)
  const wallAsUtc = Date.UTC(year, month - 1, day, 0, minutes)
  // Two passes settle the offset even across a daylight saving change.
  const firstGuess = wallAsUtc - offsetMs(new Date(wallAsUtc), timeZone)
  return new Date(wallAsUtc - offsetMs(new Date(firstGuess), timeZone))
}

export function localDateOf(instant: Date, timeZone: string): LocalDate {
  const w = wallClock(instant, timeZone)
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`
}

export function minutesOfDay(instant: Date, timeZone: string): number {
  const w = wallClock(instant, timeZone)
  return w.hour * 60 + w.minute
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const { year, month, day } = parseLocalDate(date)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

// 0 = Sunday ... 6 = Saturday, like Postgres extract(dow).
export function weekdayOf(date: LocalDate): number {
  const { year, month, day } = parseLocalDate(date)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

// 'HH:MM' or 'HH:MM:SS' (Postgres time) to minutes after midnight. '24:00' is 1440.
export function parseTime(value: string): number {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value)
  if (!match) throw new Error(`Hora inválida: ${value}`)
  return Number(match[1]) * 60 + Number(match[2])
}

export function formatMinutes(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

// Timestamps from the database. Generated columns come typed as nullable, but they never are.
export function toDate(value: string | null | undefined): Date {
  if (!value) throw new Error('Falta una fecha que la base siempre completa')
  return new Date(value)
}

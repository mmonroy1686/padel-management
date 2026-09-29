import { describe, expect, it } from 'vitest'
import {
  addDays,
  formatMinutes,
  localDateOf,
  minutesOfDay,
  parseTime,
  toDate,
  weekdayOf,
  zonedTime,
} from '@/lib/domain/time'

const MONTEVIDEO = 'America/Montevideo'

describe('zonedTime', () => {
  it('turns the club wall clock into an instant', () => {
    expect(zonedTime('2026-10-01', 8 * 60, MONTEVIDEO).toISOString()).toBe('2026-10-01T11:00:00.000Z')
  })

  it('treats 24:00 as the next midnight', () => {
    expect(zonedTime('2026-10-01', 24 * 60, MONTEVIDEO).toISOString()).toBe('2026-10-02T03:00:00.000Z')
  })

  it('follows daylight saving time', () => {
    expect(zonedTime('2026-07-01', 10 * 60, 'Europe/Madrid').toISOString()).toBe('2026-07-01T08:00:00.000Z')
    expect(zonedTime('2026-12-01', 10 * 60, 'Europe/Madrid').toISOString()).toBe('2026-12-01T09:00:00.000Z')
  })
})

describe('reading an instant on the club clock', () => {
  it('uses the club date, not the UTC date', () => {
    expect(localDateOf(new Date('2026-10-02T02:30:00Z'), MONTEVIDEO)).toBe('2026-10-01')
  })

  it('counts minutes from local midnight', () => {
    expect(minutesOfDay(new Date('2026-10-01T23:30:00Z'), MONTEVIDEO)).toBe(20 * 60 + 30)
  })
})

describe('calendar arithmetic', () => {
  it('adds days across months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('numbers weekdays like Postgres: 0 is Sunday', () => {
    expect(weekdayOf('2026-10-04')).toBe(0)
    expect(weekdayOf('2026-10-01')).toBe(4)
  })
})

describe('times of day', () => {
  it('parses Postgres times, including 24:00', () => {
    expect(parseTime('08:00')).toBe(480)
    expect(parseTime('18:30:00')).toBe(1110)
    expect(parseTime('24:00:00')).toBe(1440)
  })

  it('rejects anything else', () => {
    expect(() => parseTime('8am')).toThrow(/Hora inválida/)
  })

  it('formats minutes as HH:MM', () => {
    expect(formatMinutes(1290)).toBe('21:30')
    expect(formatMinutes(1440)).toBe('24:00')
  })
})

describe('toDate', () => {
  it('reads timestamps from the database', () => {
    expect(toDate('2026-10-01T11:00:00+00:00').toISOString()).toBe('2026-10-01T11:00:00.000Z')
  })

  it('refuses a missing value instead of inventing a date', () => {
    expect(() => toDate(null)).toThrow()
  })
})

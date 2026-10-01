import { describe, expect, it } from 'vitest'
import { seriesCreatedMessage, shortDate, SKIP_REASON_LABELS } from '@/lib/domain/series'
import { nextOccurrence, seriesByWeekday, skipsByDate, weeklyMinutes } from '@/lib/domain/series'

describe('shortDate', () => {
  it('writes the weekday and day/month', () => {
    expect(shortDate('2026-10-15')).toBe('jue 15/10')
  })
})

describe('seriesCreatedMessage', () => {
  it('confirms the series when every date was free', () => {
    expect(seriesCreatedMessage([])).toBe('Turno fijo cargado para las próximas 8 semanas.')
  })

  it('lists the dates it had to skip and why', () => {
    expect(
      seriesCreatedMessage([
        { on_date: '2026-10-15', reason: 'slot_taken' },
        { on_date: '2026-10-22', reason: 'no_price' },
      ]),
    ).toBe('Turno fijo cargado. Salteamos 2 fechas: jue 15/10 (la cancha estaba ocupada), jue 22/10 (no había precio).')
  })

  it('names every skip reason', () => {
    expect(Object.keys(SKIP_REASON_LABELS).sort()).toEqual(['court_inactive', 'no_price', 'not_aligned', 'slot_taken'])
  })
})

describe('recurring slots overview', () => {
  const series = [
    { id: 's1', weekday: 6, startTime: '20:30' },
    { id: 's2', weekday: 4, startTime: '20:30' },
    { id: 's3', weekday: 4, startTime: '19:00' },
    { id: 's4', weekday: 0, startTime: '10:00' },
  ]

  it('groups them by weekday, Monday first and by time within the day', () => {
    const week = seriesByWeekday(series)
    expect(week.map((day) => day.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0])
    expect(week[3].items.map((item) => item.id)).toEqual(['s3', 's2'])
    expect(week[6].items.map((item) => item.id)).toEqual(['s4'])
    expect(week[0].items).toEqual([])
  })

  it('finds the next date each one is played, today included', () => {
    // 2026-10-01 is a Thursday.
    expect(nextOccurrence(4, '2026-10-01')).toBe('2026-10-01')
    expect(nextOccurrence(6, '2026-10-01')).toBe('2026-10-03')
    expect(nextOccurrence(3, '2026-10-01')).toBe('2026-10-07')
  })

  it('adds up the court time they hold each week', () => {
    expect(weeklyMinutes(series, 90)).toBe(360)
  })

  it('groups the skipped dates by day, in date order', () => {
    const groups = skipsByDate([
      { id: 'k2', date: '2026-10-09' },
      { id: 'k1', date: '2026-10-03' },
      { id: 'k3', date: '2026-10-03' },
    ])
    expect(groups.map((group) => [group.date, group.items.map((item) => item.id)])).toEqual([
      ['2026-10-03', ['k1', 'k3']],
      ['2026-10-09', ['k2']],
    ])
  })
})

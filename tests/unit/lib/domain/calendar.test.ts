import { describe, expect, it } from 'vitest'
import { addMonths, isMonth, monthGrid, monthOf, recurringText, summarizeDays, weekOf } from '@/lib/domain/calendar'

describe('monthGrid', () => {
  it('covers the month in weeks that start on Monday', () => {
    const weeks = monthGrid('2026-10')
    expect(weeks).toHaveLength(5)
    expect(weeks[0][0]).toBe('2026-09-28')
    expect(weeks[4][6]).toBe('2026-11-01')
    expect(weeks.every((week) => week.length === 7)).toBe(true)
  })

  it('starts on the first when the month starts on Monday', () => {
    expect(monthGrid('2026-06')[0][0]).toBe('2026-06-01')
  })
})

describe('weeks and months', () => {
  it('returns Monday to Sunday', () => {
    expect(weekOf('2026-10-01')).toEqual([
      '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
    ])
  })

  it('moves between months', () => {
    expect(monthOf('2026-10-01')).toBe('2026-10')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
  })

  it('recognizes a month parameter', () => {
    expect(isMonth('2026-10')).toBe(true)
    expect(isMonth('2026-13')).toBe(false)
    expect(isMonth(undefined)).toBe(false)
  })
})

describe('summarizeDays', () => {
  it('counts occupancies and recurring slots per day on the club clock', () => {
    const summary = summarizeDays(
      [
        { startsAt: new Date('2026-10-01T11:00:00Z'), kind: 'booking' },
        { startsAt: new Date('2026-10-01T23:00:00Z'), kind: 'recurring' },
        { startsAt: new Date('2026-10-02T02:00:00Z'), kind: 'block' },
      ],
      'America/Montevideo',
      30,
    )
    expect(summary.get('2026-10-01')).toEqual({ occupied: 3, recurring: 1, percent: 10 })
    expect(summary.get('2026-10-02')).toBeUndefined()
  })
})

describe('recurringText', () => {
  it('counts recurring slots in singular and plural', () => {
    expect(recurringText(1)).toBe('1 fijo')
    expect(recurringText(3)).toBe('3 fijos')
    expect(recurringText(1, { long: true })).toBe('1 turno fijo')
    expect(recurringText(2, { long: true })).toBe('2 turnos fijos')
  })
})

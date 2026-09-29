import { describe, expect, it } from 'vitest'
import { dayLabel, dayLongLabel, formatPrice, monthLabel, timeIn } from '@/lib/domain/format'

describe('formatPrice', () => {
  it('writes pesos with a dot every three digits', () => {
    expect(formatPrice(1200)).toBe('$1.200')
    expect(formatPrice(1600000)).toBe('$1.600.000')
    expect(formatPrice(0)).toBe('$0')
  })
})

describe('day labels', () => {
  const today = '2026-09-29'

  it('says today and tomorrow in words', () => {
    expect(dayLabel(today, today)).toBe('Hoy')
    expect(dayLabel('2026-09-30', today)).toBe('Mañana')
  })

  it('uses the short weekday and the day of the month after that', () => {
    expect(dayLabel('2026-10-01', today)).toBe('jue 1')
  })

  it('has a long form for sheets and cards', () => {
    expect(dayLongLabel('2026-10-01')).toBe('jueves 1 de octubre')
  })

  it('names months for the calendar', () => {
    expect(monthLabel('2026-10')).toBe('Octubre 2026')
  })
})

describe('timeIn', () => {
  it('shows the time on the club clock', () => {
    expect(timeIn(new Date('2026-10-01T23:30:00Z'), 'America/Montevideo')).toBe('20:30')
  })
})

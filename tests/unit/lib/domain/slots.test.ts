import { describe, expect, it } from 'vitest'
import { daySlots, priceFor, type ClubSchedule, type PricingRule } from '@/lib/domain/slots'

const PROTOTYPE: ClubSchedule = {
  timezone: 'America/Montevideo',
  opensAt: '08:00:00',
  closesAt: '23:00:00',
  slotMinutes: 90,
}
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]
const RULES: PricingRule[] = [
  { weekdays: EVERY_DAY, fromTime: '08:00:00', toTime: '18:30:00', price: 1200 },
  { weekdays: EVERY_DAY, fromTime: '18:30:00', toTime: '24:00:00', price: 1600 },
]
const THURSDAY = '2026-10-01'

describe('daySlots', () => {
  it('builds the prototype grid: 08:00 to 21:30 every 90 minutes', () => {
    expect(daySlots(PROTOTYPE, THURSDAY).map((slot) => slot.label)).toEqual([
      '08:00', '09:30', '11:00', '12:30', '14:00', '15:30', '17:00', '18:30', '20:00', '21:30',
    ])
  })

  it('places each slot on the club clock', () => {
    const [first] = daySlots(PROTOTYPE, THURSDAY)
    expect(first.startsAt.toISOString()).toBe('2026-10-01T11:00:00.000Z')
    expect(first.endsAt.toISOString()).toBe('2026-10-01T12:30:00.000Z')
    expect(first.startMinutes).toBe(480)
  })

  it('keeps a last slot that ends exactly at 24:00', () => {
    const last = daySlots({ ...PROTOTYPE, opensAt: '09:00', closesAt: '24:00:00' }, THURSDAY).at(-1)
    expect(last?.label).toBe('22:30')
    expect(last?.endsAt.toISOString()).toBe('2026-10-02T03:00:00.000Z')
  })

  it('drops a slot that would end after closing', () => {
    expect(daySlots({ ...PROTOTYPE, closesAt: '22:59' }, THURSDAY).at(-1)?.label).toBe('20:00')
  })

  it('returns no slots for a broken schedule', () => {
    expect(daySlots({ ...PROTOTYPE, slotMinutes: 0 }, THURSDAY)).toEqual([])
  })
})

describe('priceFor', () => {
  it('uses the daytime price before 18:30', () => {
    expect(priceFor(RULES, THURSDAY, 17 * 60)).toBe(1200)
  })

  it('switches to the evening price at 18:30', () => {
    expect(priceFor(RULES, THURSDAY, 18 * 60 + 30)).toBe(1600)
  })

  it('lets the band that starts latest win on its weekday', () => {
    const rules = [...RULES, { weekdays: [4], fromTime: '20:00', toTime: '24:00', price: 2000 }]
    expect(priceFor(rules, THURSDAY, 20 * 60)).toBe(2000)
    expect(priceFor(rules, '2026-10-02', 20 * 60)).toBe(1600)
  })

  it('has no price when no band covers that weekday', () => {
    const weekdaysOnly = [{ weekdays: [1, 2, 3, 4, 5], fromTime: '08:00', toTime: '24:00', price: 1000 }]
    expect(priceFor(weekdaysOnly, '2026-10-04', 10 * 60)).toBeNull()
  })
})

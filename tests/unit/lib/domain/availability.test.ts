import { describe, expect, it } from 'vitest'
import { availabilityKey, dayBandOf, parseAvailability } from '@/lib/domain/availability'

describe('dayBandOf', () => {
  it('splits the day like the database: before 13, 13 to 18, from 18', () => {
    expect(dayBandOf(8 * 60)).toBe('morning')
    expect(dayBandOf(12 * 60 + 59)).toBe('morning')
    expect(dayBandOf(13 * 60)).toBe('afternoon')
    expect(dayBandOf(17 * 60 + 30)).toBe('afternoon')
    expect(dayBandOf(18 * 60)).toBe('night')
  })
})

describe('availabilityKey', () => {
  it('is the same key save_my_availability takes', () => {
    expect(availabilityKey(4, 'night')).toBe('4-night')
  })
})

describe('parseAvailability', () => {
  it('keeps valid keys once', () => {
    expect(parseAvailability(['1-night', '4-morning', '1-night'])).toEqual(['1-night', '4-morning'])
    expect(parseAvailability([])).toEqual([])
  })

  it('rejects anything else', () => {
    expect(parseAvailability(['7-night'])).toBeNull()
    expect(parseAvailability(['1-noon'])).toBeNull()
    expect(parseAvailability([new File([], 'x')])).toBeNull()
  })
})

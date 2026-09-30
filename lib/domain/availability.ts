// When a player usually can play: weekday (0 = Sunday) by band of the day, on the club's clock.
export const DAY_BANDS = ['morning', 'afternoon', 'night'] as const
export type DayBand = (typeof DAY_BANDS)[number]

export const DAY_BAND_LABELS: Record<DayBand, string> = { morning: 'Mañana', afternoon: 'Tarde', night: 'Noche' }
export const DAY_BAND_WORDS: Record<DayBand, string> = { morning: 'de mañana', afternoon: 'de tarde', night: 'de noche' }

const KEY = /^[0-6]-(morning|afternoon|night)$/

// Same split as private.day_band_of: before 13:00, 13:00 to 18:00, from 18:00.
export function dayBandOf(minutes: number): DayBand {
  if (minutes < 13 * 60) return 'morning'
  if (minutes < 18 * 60) return 'afternoon'
  return 'night'
}

// '<weekday>-<band>', the format save_my_availability takes.
export function availabilityKey(weekday: number, band: DayBand): string {
  return `${weekday}-${band}`
}

export function parseAvailability(values: FormDataEntryValue[]): string[] | null {
  if (values.some((value) => typeof value !== 'string' || !KEY.test(value))) return null
  const unique = [...new Set(values as string[])]
  return unique.length <= 21 ? unique : null
}

import { formatMinutes, parseTime, weekdayOf, zonedTime, type LocalDate } from './time'

export type ClubSchedule = { timezone: string; opensAt: string; closesAt: string; slotMinutes: number }
export type PricingRule = { weekdays: number[]; fromTime: string; toTime: string; price: number }
export type Slot = { startMinutes: number; label: string; startsAt: Date; endsAt: Date }

// Same grid as private.slot_period: opens_at + n * slot_minutes, ending no later than closes_at.
export function daySlots(schedule: ClubSchedule, date: LocalDate): Slot[] {
  if (schedule.slotMinutes <= 0) return []
  const open = parseTime(schedule.opensAt)
  const close = parseTime(schedule.closesAt)
  const slots: Slot[] = []
  for (let start = open; start + schedule.slotMinutes <= close; start += schedule.slotMinutes) {
    slots.push({
      startMinutes: start,
      label: formatMinutes(start),
      startsAt: zonedTime(date, start, schedule.timezone),
      endsAt: zonedTime(date, start + schedule.slotMinutes, schedule.timezone),
    })
  }
  return slots
}

// Same rule as private.slot_price: the band that covers the start on that weekday; the band that
// starts latest wins. null means the slot cannot be booked.
export function priceFor(rules: PricingRule[], date: LocalDate, startMinutes: number): number | null {
  const weekday = weekdayOf(date)
  const covering = rules
    .filter(
      (rule) =>
        rule.weekdays.includes(weekday) &&
        parseTime(rule.fromTime) <= startMinutes &&
        startMinutes < parseTime(rule.toTime),
    )
    .sort((a, b) => parseTime(b.fromTime) - parseTime(a.fromTime))
  return covering[0]?.price ?? null
}

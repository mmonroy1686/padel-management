import { buildDayGrid, type Court, type DayGrid, type GridBooking, type Occupancy, type OccupancyKind } from '@/lib/domain/grid'
import { daySlots, type ClubSchedule, type PricingRule } from '@/lib/domain/slots'
import { zonedTime } from '@/lib/domain/time'

// The prototype club on Thursday 2026-10-01: 08:00 ... 21:30, $1.200 and $1.600 from 18:30.
export const TIMEZONE = 'America/Montevideo'
export const DATE = '2026-10-01'
export const SCHEDULE: ClubSchedule = { timezone: TIMEZONE, opensAt: '08:00', closesAt: '23:00', slotMinutes: 90 }
export const RULES: PricingRule[] = [
  { weekdays: [0, 1, 2, 3, 4, 5, 6], fromTime: '08:00', toTime: '18:30', price: 1200 },
  { weekdays: [0, 1, 2, 3, 4, 5, 6], fromTime: '18:30', toTime: '24:00', price: 1600 },
]
export const COURTS: Court[] = [
  { id: 'court-1', name: 'Cancha 1', isCovered: true },
  { id: 'court-2', name: 'Cancha 2', isCovered: false },
]

export function at(hhmm: string, date = DATE): Date {
  const [hours, minutes] = hhmm.split(':').map(Number)
  return zonedTime(date, hours * 60 + minutes, TIMEZONE)
}

export function occupancy(
  id: string,
  courtId: string,
  from: string,
  to: string,
  kind: OccupancyKind = 'booking',
  note: string | null = null,
): Occupancy {
  return { id, courtId, kind, note, startsAt: at(from), endsAt: at(to) }
}

export function booking(occupancyId: string, overrides: Partial<GridBooking> = {}): GridBooking {
  return {
    id: `b-${occupancyId}`,
    occupancyId,
    isMine: false,
    holderName: 'Rodríguez',
    playerId: null,
    price: 1200,
    source: 'reception',
    seriesId: null,
    paymentState: 'pending',
    amountDue: 1200,
    ...overrides,
  }
}

export function makeGrid({
  occupancies = [],
  bookings = [],
  now = at('07:00'),
  rules = RULES,
}: { occupancies?: Occupancy[]; bookings?: GridBooking[]; now?: Date; rules?: PricingRule[] } = {}): DayGrid {
  return buildDayGrid({ date: DATE, slots: daySlots(SCHEDULE, DATE), courts: COURTS, rules, occupancies, bookings, now })
}

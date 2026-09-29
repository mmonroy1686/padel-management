import type { PaymentState } from './payments'
import { priceFor, type PricingRule, type Slot } from './slots'
import { formatMinutes, type LocalDate } from './time'

export type OccupancyKind = 'booking' | 'recurring' | 'tournament' | 'block' | 'match' | 'day_use'
export type Court = { id: string; name: string; isCovered: boolean }
export type Occupancy = {
  id: string
  courtId: string
  kind: OccupancyKind
  startsAt: Date
  endsAt: Date
  note: string | null
}
// What the viewer may know about the booking behind an occupancy. Players only get their own.
export type GridBooking = {
  id: string
  occupancyId: string
  isMine: boolean
  holderName: string | null
  playerId: string | null
  price: number
  source: 'online' | 'reception'
  seriesId: string | null
  paymentState: PaymentState
  amountDue: number
}
export type CellState = 'free' | 'mine' | 'taken' | 'past' | 'no_price'
export type GridCell = {
  court: Court
  slot: Slot
  state: CellState
  price: number | null
  occupancy: Occupancy | null
  booking: GridBooking | null
  offGrid: boolean
}
export type GridRow = { slot: Slot; past: boolean; cells: GridCell[] }
export type DayGrid = { date: LocalDate; courts: Court[]; rows: GridRow[]; outside: Occupancy[] }

export const KIND_LABELS: Record<OccupancyKind, string> = {
  booking: 'Reserva',
  recurring: 'Turno fijo',
  tournament: 'Torneo',
  block: 'Bloqueo',
  match: 'Partido',
  day_use: 'Day use',
}

function overlaps(occupancy: Occupancy, slot: Slot): boolean {
  return occupancy.startsAt < slot.endsAt && occupancy.endsAt > slot.startsAt
}

// A booking that no longer lines up with the grid (the club changed its hours or slot length).
function isOffGrid(occupancy: Occupancy | null, slot: Slot): boolean {
  if (!occupancy || (occupancy.kind !== 'booking' && occupancy.kind !== 'recurring')) return false
  return (
    occupancy.startsAt.getTime() !== slot.startsAt.getTime() || occupancy.endsAt.getTime() !== slot.endsAt.getTime()
  )
}

function cellState(occupancy: Occupancy | null, booking: GridBooking | null, past: boolean, price: number | null): CellState {
  if (occupancy) return booking?.isMine ? 'mine' : 'taken'
  if (past) return 'past'
  if (price === null) return 'no_price'
  return 'free'
}

export function buildDayGrid(input: {
  date: LocalDate
  slots: Slot[]
  courts: Court[]
  rules: PricingRule[]
  occupancies: Occupancy[]
  bookings: GridBooking[]
  now: Date
}): DayGrid {
  const bookingByOccupancy = new Map(input.bookings.map((booking) => [booking.occupancyId, booking]))
  const rows = input.slots.map((slot) => {
    const past = slot.startsAt.getTime() <= input.now.getTime()
    const price = priceFor(input.rules, input.date, slot.startMinutes)
    const cells = input.courts.map((court) => {
      const occupancy = input.occupancies.find((o) => o.courtId === court.id && overlaps(o, slot)) ?? null
      const booking = occupancy ? (bookingByOccupancy.get(occupancy.id) ?? null) : null
      return {
        court,
        slot,
        price,
        occupancy,
        booking,
        state: cellState(occupancy, booking, past, price),
        offGrid: isOffGrid(occupancy, slot),
      }
    })
    return { slot, past, cells }
  })
  const outside = input.occupancies.filter((o) => !input.slots.some((slot) => overlaps(o, slot)))
  return { date: input.date, courts: input.courts, rows, outside }
}

export function visibleRows(rows: GridRow[], options: { onlyFree: boolean; showPast: boolean }): GridRow[] {
  return rows.filter(
    (row) => (options.showPast || !row.past) && (!options.onlyFree || row.cells.some((cell) => cell.state === 'free')),
  )
}

export function countFree(rows: GridRow[]): number {
  return rows.reduce((total, row) => total + row.cells.filter((cell) => cell.state === 'free').length, 0)
}

export function dayStats(grid: DayGrid): { occupancyPercent: number; revenue: number } {
  const cells = grid.rows.flatMap((row) => row.cells)
  if (cells.length === 0) return { occupancyPercent: 0, revenue: 0 }
  const occupied = cells.filter((cell) => cell.occupancy).length
  const prices = new Map(cells.flatMap((cell) => (cell.booking ? [[cell.booking.id, cell.booking.price] as const] : [])))
  const revenue = [...prices.values()].reduce((sum, price) => sum + price, 0)
  return { occupancyPercent: Math.round((occupied / cells.length) * 100), revenue }
}

// End times reception can pick for a block that starts at `cell`: slot ends on the same court,
// until the next occupancy.
export function blockEndOptions(rows: GridRow[], cell: GridCell): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = []
  const start = rows.findIndex((row) => row.slot.startsAt.getTime() === cell.slot.startsAt.getTime())
  if (start < 0) return options
  for (const row of rows.slice(start)) {
    const sameCourt = row.cells.find((c) => c.court.id === cell.court.id)
    if (!sameCourt || sameCourt.occupancy) break
    const minutes = (row.slot.endsAt.getTime() - row.slot.startsAt.getTime()) / 60_000
    options.push({ value: row.slot.endsAt.toISOString(), label: formatMinutes(row.slot.startMinutes + minutes) })
  }
  return options
}

export function holderName(guestName: string | null, playerName: string | null): string | null {
  return guestName ?? playerName ?? null
}

import type { MatchPlayerPayment } from './match-payments'
import { filledCount, type Match } from './matches'
import type { PaymentState } from './payments'
import { priceFor, type PricingRule, type Slot } from './slots'
import { formatMinutes, toDate, type LocalDate } from './time'

export type OccupancyKind = 'booking' | 'recurring' | 'tournament' | 'block' | 'match' | 'day_use'
export type Court = { id: string; name: string; isCovered: boolean }
export type Occupancy = {
  id: string
  courtId: string
  kind: OccupancyKind
  startsAt: Date
  endsAt: Date
  note: string | null
  // The tournament that blocks the court (kind 'tournament'); members may read it.
  tournamentId?: string | null
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
  matchId?: string | null
  matchPlayers?: MatchPlayerPayment[]
}
// A forming match that wants this court at this time. It does not block it.
export type FormingMatchRef = { id: string; filled: number }
export type CellState = 'free' | 'mine' | 'taken' | 'past' | 'no_price'
export type GridCell = {
  court: Court
  slot: Slot
  state: CellState
  price: number | null
  occupancy: Occupancy | null
  booking: GridBooking | null
  offGrid: boolean
  formingMatch?: FormingMatchRef | null
}
export type GridRow = { slot: Slot; past: boolean; cells: GridCell[] }
export type DayGrid = { date: LocalDate; courts: Court[]; rows: GridRow[]; outside: Occupancy[]; matches: Match[] }

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

function formingAt(matches: Match[], courtId: string, slot: Slot): FormingMatchRef | null {
  const match = matches.find(
    (candidate) =>
      candidate.status === 'forming' &&
      candidate.bookingId === null &&
      candidate.preferredCourtId === courtId &&
      candidate.startsAt.getTime() === slot.startsAt.getTime(),
  )
  return match ? { id: match.id, filled: filledCount(match) } : null
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
  matches?: Match[]
  now: Date
}): DayGrid {
  const matches = input.matches ?? []
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
        formingMatch: occupancy ? null : formingAt(matches, court.id, slot),
      }
    })
    return { slot, past, cells }
  })
  const outside = input.occupancies.filter((o) => !input.slots.some((slot) => overlaps(o, slot)))
  return { date: input.date, courts: input.courts, rows, outside, matches }
}

export type OccupancyRow = {
  id: string
  court_id: string
  kind: OccupancyKind
  starts_at: string | null
  ends_at: string | null
  note: string | null
  tournament_id?: string | null
}

// Block reasons are for staff only: a player's grid never carries them to the browser.
export function toOccupancy(row: OccupancyRow, audience: 'player' | 'staff'): Occupancy {
  return {
    id: row.id,
    courtId: row.court_id,
    kind: row.kind,
    note: audience === 'staff' ? row.note : null,
    startsAt: toDate(row.starts_at),
    endsAt: toDate(row.ends_at),
    ...(row.tournament_id ? { tournamentId: row.tournament_id } : {}),
  }
}

export function visibleRows(rows: GridRow[], options: { onlyFree: boolean; showPast: boolean }): GridRow[] {
  return rows.filter(
    (row) => (options.showPast || !row.past) && (!options.onlyFree || row.cells.some((cell) => cell.state === 'free')),
  )
}

// An occupancy longer than a slot (a block, or a booking left off the grid after the club changed
// its hours) fills several rows. Only the first shown row carries its card; the rest continue it.
export function continuesAbove(rows: GridRow[], rowIndex: number, courtIndex: number): boolean {
  const occupancy = rows[rowIndex]?.cells[courtIndex]?.occupancy
  return !!occupancy && rows[rowIndex - 1]?.cells[courtIndex]?.occupancy?.id === occupancy.id
}

// How many rows, from this one down, the same occupancy fills in this court: the grid draws it as one
// block over all of them.
export function rowsCovered(rows: GridRow[], rowIndex: number, courtIndex: number): number {
  const id = rows[rowIndex]?.cells[courtIndex]?.occupancy?.id
  if (!id) return 1
  let count = 1
  while (rows[rowIndex + count]?.cells[courtIndex]?.occupancy?.id === id) count++
  return count
}

// When a block over several slots ends (e.g. "13:00"); null for a single slot.
export function blockEnd(rows: GridRow[], rowIndex: number, courtIndex: number): string | null {
  const span = rowsCovered(rows, rowIndex, courtIndex)
  if (span < 2) return null
  const last = rows[rowIndex + span - 1].slot
  return formatMinutes(last.startMinutes + (last.endsAt.getTime() - last.startsAt.getTime()) / 60_000)
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

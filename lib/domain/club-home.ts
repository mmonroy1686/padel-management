import { formatPrice, timeIn } from './format'
import { countFree, dayStats, holderName, KIND_LABELS, type DayGrid, type Occupancy } from './grid'
import { shareFor, type SlotHolder } from './match-payments'
import { openSlots, type Match } from './matches'
import type { PaymentStatus } from './payments'
import { holderLabel, refundsDue, type OverviewBooking } from './payments-overview'
import { toDate } from './time'

// The club's Inicio: what is being played now, what comes next, what was played today and is still owed, each
// player's share of a booking, and the day (occupancy, alerts, cancellations). Same rules as charge_booking_share
// and charge_booking_rest.

export type HomePayment = {
  status: PaymentStatus
  amount: number
  payer_id: string | null
  payer_position: number | null
}
export type ExtraPlayerRow = {
  position: number
  player_id: string | null
  name: string | null
  player: { display_name: string } | null
}
// A booking as lib/data reads it, with its players 2 to 4 (booking_players) or its match spots.
export type TurnBookingRow = {
  id: string
  price: number
  player_id: string | null
  guest_name: string | null
  match_id: string | null
  player: { display_name: string } | null
  match: { slots: SlotHolder[] } | null
  players: ExtraPlayerRow[]
  payments: HomePayment[]
}

// paid: nothing left of his share. due: reception can charge `due`. reported: a transfer from the app covers it
// while the club checks it.
export type ShareState = 'paid' | 'due' | 'reported'
export type PlayerShare = {
  position: number
  // null: nobody named yet ("Jugador 3").
  name: string | null
  playerId: string | null
  share: number
  due: number
  state: ShareState
  // He paid something with his position: set_booking_players does not change him.
  locked: boolean
}
export type TurnPlayers = { isMatch: boolean; players: PlayerShare[]; restDue: number; missingNames: boolean }

export type CourtTurn = TurnPlayers & {
  kind: 'turn'
  id: string
  bookingId: string
  courtName: string
  startsAt: Date
  endsAt: Date
}
// A block, a tournament or championship, a day use: a line without charges.
export type CourtEvent = {
  kind: 'event'
  id: string
  courtName: string
  startsAt: Date
  endsAt: Date
  // What holds the court: the card's icon.
  occupancyKind: Occupancy['kind']
  label: string
  href: string | null
}
export type CourtItem = CourtTurn | CourtEvent
export type HomeSections = {
  playing: CourtItem[]
  // Ended within RECENT_MINUTES and still owe something: they stay in "En cancha ahora".
  recent: CourtTurn[]
  upcoming: CourtItem[]
  pending: CourtTurn[]
  next: CourtItem | null
}
export type Competition = { kind: 'tournament' | 'championship'; id: string; name: string }
export type AlertKind = 'forming' | 'waiting' | 'tournament' | 'championship' | 'day_use'
export type HomeAlert = { kind: AlertKind; text: string; href: string }
export type Cancellation = { bookingId: string; courtName: string; startsAt: Date; holder: string; refund: number }
export type FreeSlot = { courtName: string; startsAt: Date; label: string }
export type DayOccupancy = { percent: number; free: number; slots: FreeSlot[] }
export type ReportedTransfer = { amount: number; created_at: string }
export type TransfersSummary = { count: number; total: number; text: string; age: string }

// "Próximos": what starts in the next hour and a half.
export const UPCOMING_MINUTES = 90
// A court that ended this long ago and still owes stays in "En cancha ahora".
export const RECENT_MINUTES = 30
// "El día": how many free slots the Ocupación card lists.
export const FREE_SLOTS_SHOWN = 4
const POSITIONS = [1, 2, 3, 4] as const
const BOOKING_KINDS = new Set<Occupancy['kind']>(['booking', 'recurring', 'match'])

const total = (payments: HomePayment[]) => payments.reduce((sum, payment) => sum + payment.amount, 0)

export function playerLabel(player: Pick<PlayerShare, 'position' | 'name'>): string {
  return player.name ?? `Jugador ${player.position}`
}

// The name of the button that charges one share, and of its confirmation: "Cobrar $300 a Bruno".
export function chargeLabel(player: Pick<PlayerShare, 'position' | 'name' | 'due'>): string {
  return `Cobrar ${formatPrice(player.due)} a ${playerLabel(player)}`
}

function shareState(owed: number, due: number): ShareState {
  if (owed === 0) return 'paid'
  return due > 0 ? 'due' : 'reported'
}

// A booking of one holder: each share counts its own payments first; what the booking got without position
// covers what is left in general, so nobody is charged past the price (private.position_due, private.booking_left).
function bookingPlayers(booking: TurnBookingRow): TurnPlayers {
  const confirmed = booking.payments.filter((payment) => payment.status === 'confirmed')
  const paid = total(confirmed)
  const reported = total(booking.payments.filter((payment) => payment.status === 'reported' && payment.payer_id === null))
  const left = Math.max(0, booking.price - paid - reported)
  const players = POSITIONS.map((position): PlayerShare => {
    const share = shareFor(booking.price, position)
    const own = confirmed.filter((payment) => payment.payer_position === position)
    const owed = paid >= booking.price ? 0 : Math.max(0, share - total(own))
    const due = Math.min(owed, left)
    const row = booking.players.find((player) => player.position === position)
    const name =
      position === 1
        ? holderName(booking.guest_name, booking.player?.display_name ?? null)
        : row
          ? (row.name ?? row.player?.display_name ?? 'Sin nombre')
          : null
    return {
      position,
      name,
      playerId: position === 1 ? booking.player_id : (row?.player_id ?? null),
      share,
      due,
      state: shareState(owed, due),
      locked: own.length > 0,
    }
  })
  return { isMatch: false, players, restDue: left, missingNames: players.some((player) => player.name === null) }
}

// An open match: its spots are its players and each one owes his own share (private.share_due).
function matchPlayers(booking: TurnBookingRow): TurnPlayers {
  const players = [...(booking.match?.slots ?? [])]
    .sort((a, b) => a.position - b.position)
    .flatMap((slot): PlayerShare[] => {
      if (!slot.player_id) return []
      const playerId = slot.player_id
      const share = shareFor(booking.price, slot.position)
      const own = booking.payments.filter((payment) => payment.payer_id === playerId)
      const owed = Math.max(0, share - total(own.filter((payment) => payment.status === 'confirmed')))
      const due = Math.max(0, owed - total(own.filter((payment) => payment.status === 'reported')))
      return [
        {
          position: slot.position,
          name: slot.player?.display_name ?? 'Jugador',
          playerId,
          share,
          due,
          state: shareState(owed, due),
          locked: false,
        },
      ]
    })
  return { isMatch: true, players, restDue: players.reduce((sum, player) => sum + player.due, 0), missingNames: false }
}

export function turnPlayers(booking: TurnBookingRow): TurnPlayers {
  return booking.match_id ? matchPlayers(booking) : bookingPlayers(booking)
}

function eventHref(occupancy: Occupancy): string | null {
  if (occupancy.tournamentId) return `/club/torneos/${occupancy.tournamentId}`
  if (occupancy.championshipId) return `/club/torneos/campeonatos/${occupancy.championshipId}`
  if (occupancy.kind === 'day_use') return '/club/day-use'
  return null
}

// One item per occupancy of the day, in time order and, at the same time, in the club's court order. A court held
// for the waitlist is not news here.
export function courtItems(input: {
  courts: { id: string; name: string }[]
  occupancies: Occupancy[]
  bookings: (TurnBookingRow & { occupancy_id: string | null })[]
}): CourtItem[] {
  const courtIndex = new Map(input.courts.map((court, index) => [court.id, index]))
  const courtName = new Map(input.courts.map((court) => [court.id, court.name]))
  const bookingByOccupancy = new Map(input.bookings.map((booking) => [booking.occupancy_id, booking]))
  return [...input.occupancies]
    .sort(
      (a, b) =>
        a.startsAt.getTime() - b.startsAt.getTime() ||
        (courtIndex.get(a.courtId) ?? 0) - (courtIndex.get(b.courtId) ?? 0),
    )
    .flatMap((occupancy): CourtItem[] => {
      if (occupancy.kind === 'hold') return []
      const base = {
        id: occupancy.id,
        courtName: courtName.get(occupancy.courtId) ?? 'Cancha',
        startsAt: occupancy.startsAt,
        endsAt: occupancy.endsAt,
      }
      if (BOOKING_KINDS.has(occupancy.kind)) {
        const booking = bookingByOccupancy.get(occupancy.id)
        return booking ? [{ ...base, kind: 'turn', bookingId: booking.id, ...turnPlayers(booking) }] : []
      }
      return [
        {
          ...base,
          kind: 'event',
          occupancyKind: occupancy.kind,
          label: occupancy.note ?? KIND_LABELS[occupancy.kind],
          href: eventHref(occupancy),
        },
      ]
    })
}

// En cancha ahora: started (at `now` included) and not ended. Recientes: a booking that ended (at `now` included)
// up to 30 minutes ago and still owes something. Próximos: starts within 90 minutes. Pendientes de cobro: a booking
// that ended before that and still owes something.
export function homeSections(items: CourtItem[], now: Date): HomeSections {
  const time = now.getTime()
  const horizon = time + UPCOMING_MINUTES * 60_000
  const recentFrom = time - RECENT_MINUTES * 60_000
  const owing = items.filter(
    (item): item is CourtTurn => item.kind === 'turn' && item.endsAt.getTime() <= time && item.restDue > 0,
  )
  return {
    playing: items.filter((item) => item.startsAt.getTime() <= time && time < item.endsAt.getTime()),
    recent: owing.filter((item) => item.endsAt.getTime() >= recentFrom),
    upcoming: items.filter((item) => item.startsAt.getTime() > time && item.startsAt.getTime() <= horizon),
    pending: owing.filter((item) => item.endsAt.getTime() < recentFrom),
    next: items.find((item) => item.startsAt.getTime() > time) ?? null,
  }
}

// The bar of a court in play: how much of the slot went by, and what is left in words.
export function timeLeft(item: { startsAt: Date; endsAt: Date }, now: Date): { percentDone: number; text: string } {
  const length = item.endsAt.getTime() - item.startsAt.getTime()
  const done = Math.min(Math.max(now.getTime() - item.startsAt.getTime(), 0), length)
  const minutes = Math.max(0, Math.ceil((item.endsAt.getTime() - now.getTime()) / 60_000))
  return {
    percentDone: length > 0 ? Math.round((done / length) * 100) : 100,
    text: minutes === 1 ? 'Falta 1 min' : `Faltan ${minutes} min`,
  }
}

// The header of a court: "Empieza 14:30", "Faltan 34 min" or "Terminó hace 12 min".
export function turnLabel(item: { startsAt: Date; endsAt: Date }, now: Date, timezone: string): string {
  const time = now.getTime()
  if (item.startsAt.getTime() > time) return `Empieza ${timeIn(item.startsAt, timezone)}`
  if (time < item.endsAt.getTime()) return timeLeft(item, now).text
  const minutes = Math.floor((time - item.endsAt.getTime()) / 60_000)
  return minutes === 0 ? 'Terminó recién' : `Terminó hace ${ago(time - item.endsAt.getTime())}`
}

// The tournaments and championships that hold a court today, once each.
export function competitionsToday(occupancies: Occupancy[]): Competition[] {
  const found = new Map<string, Competition>()
  for (const occupancy of occupancies) {
    if (occupancy.tournamentId && !found.has(occupancy.tournamentId)) {
      found.set(occupancy.tournamentId, {
        kind: 'tournament',
        id: occupancy.tournamentId,
        name: occupancy.note ?? KIND_LABELS.tournament,
      })
    }
    if (occupancy.championshipId && !found.has(occupancy.championshipId)) {
      found.set(occupancy.championshipId, {
        kind: 'championship',
        id: occupancy.championshipId,
        name: occupancy.note ?? KIND_LABELS.championship,
      })
    }
  }
  return [...found.values()]
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

// Avisos: only what asks for something, each with its link; nothing for what does not happen.
export function alerts(input: {
  forming: Pick<Match, 'slots'>[]
  competitions: Competition[]
  inside: number
  waiting: number
}): HomeAlert[] {
  const list: HomeAlert[] = []
  if (input.forming.length > 0) {
    const missing = input.forming.reduce((sum, match) => sum + openSlots(match).length, 0)
    const matches = plural(input.forming.length, 'partido armándose', 'partidos armándose')
    const players = `${missing === 1 ? 'falta' : 'faltan'} ${plural(missing, 'jugador', 'jugadores')}`
    list.push({
      kind: 'forming',
      href: '/club/grilla',
      text: missing > 0 ? `${matches} · ${players}` : matches,
    })
  }
  if (input.waiting > 0) {
    list.push({ kind: 'waiting', href: '/club/grilla', text: `${input.waiting} esperando turno hoy` })
  }
  for (const competition of input.competitions) {
    list.push(
      competition.kind === 'tournament'
        ? {
            kind: 'tournament',
            href: `/club/torneos/${competition.id}`,
            text: `Torneo ${competition.name} en juego`,
          }
        : {
            kind: 'championship',
            href: `/club/torneos/campeonatos/${competition.id}`,
            text: `Campeonato ${competition.name} en juego`,
          },
    )
  }
  if (input.inside > 0) {
    list.push({ kind: 'day_use', href: '/club/day-use', text: `${input.inside} en el club (day use)` })
  }
  return list
}

// Today's cancelled bookings, in time order, with what the club has to give back: its confirmed payments, the same
// rule as Cobros (refundsDue).
export function cancellationsToday(rows: OverviewBooking[]): Cancellation[] {
  return rows
    .map((row) => ({
      bookingId: row.id,
      courtName: row.court?.name ?? 'Cancha',
      startsAt: toDate(row.starts_at),
      holder: row.match_id && !row.guest_name && !row.player ? 'Partido abierto' : holderLabel(row),
      refund: refundsDue([row]).reduce((sum, item) => sum + item.amount, 0),
    }))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
}

// The next free slots of the day after `now`, in time order and, at the same time, in the club's court order.
export function freeSlotsAhead(grid: Pick<DayGrid, 'rows'>, now: Date, limit: number): FreeSlot[] {
  return grid.rows
    .filter((row) => row.slot.startsAt.getTime() > now.getTime())
    .flatMap((row) =>
      row.cells
        .filter((cell) => cell.state === 'free')
        .map((cell) => ({
          courtName: cell.court.name,
          startsAt: row.slot.startsAt,
          label: `${row.slot.label} ${cell.court.name}`,
        })),
    )
    .slice(0, limit)
}

// Ocupación: the day's occupancy, how many slots are still free and the next ones.
export function dayOccupancy(grid: DayGrid, now: Date): DayOccupancy {
  return {
    percent: dayStats(grid).occupancyPercent,
    free: countFree(grid.rows),
    slots: freeSlotsAhead(grid, now, FREE_SLOTS_SHOWN),
  }
}

// "68 % ocupado · 7 turnos libres".
export function occupancyLine(occupancy: Pick<DayOccupancy, 'percent' | 'free'>): string {
  return `${occupancy.percent} % ocupado · ${plural(occupancy.free, 'turno libre', 'turnos libres')}`
}

function ago(milliseconds: number): string {
  const minutes = Math.max(0, Math.floor(milliseconds / 60_000))
  if (minutes === 0) return 'un momento'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h`
  return plural(Math.floor(hours / 24), 'día', 'días')
}

// The transfers card: "11 transferencias por confirmar · $13.800" and "la más vieja hace 2 h"; null without any.
export function transfersCard(rows: ReportedTransfer[], now: Date): TransfersSummary | null {
  if (rows.length === 0) return null
  const money = rows.reduce((sum, row) => sum + row.amount, 0)
  const since = ago(now.getTime() - Math.min(...rows.map((row) => new Date(row.created_at).getTime())))
  return {
    count: rows.length,
    total: money,
    text: `${plural(rows.length, 'transferencia por confirmar', 'transferencias por confirmar')} · ${formatPrice(money)}`,
    age: rows.length === 1 ? `hace ${since}` : `la más vieja hace ${since}`,
  }
}

// "Completar jugadores": only while someone is missing and the booking has not ended (set_booking_players refuses
// it after the end, in_the_past). A match's players join from the app.
export function canAddPlayers(turn: TurnPlayers, endsAt: Date, now: Date): boolean {
  return !turn.isMatch && turn.missingNames && now.getTime() < endsAt.getTime()
}

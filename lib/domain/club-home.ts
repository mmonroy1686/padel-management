import { formatPrice } from './format'
import { holderName, KIND_LABELS, type Occupancy } from './grid'
import { shareFor, type SlotHolder } from './match-payments'
import type { PaymentStatus } from './payments'

// The club's Inicio: what is being played now, what comes next, what was played today and is still owed, and
// each player's share of a booking. Same rules as charge_booking_share and charge_booking_rest.

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
  label: string
  href: string | null
}
export type CourtItem = CourtTurn | CourtEvent
export type HomeSections = { playing: CourtItem[]; upcoming: CourtItem[]; pending: CourtTurn[]; next: CourtItem | null }
export type Competition = { kind: 'tournament' | 'championship'; id: string; name: string }
export type TodayLine = { text: string; href: string }

// "Próximos": what starts in the next hour and a half.
export const UPCOMING_MINUTES = 90
const POSITIONS = [1, 2, 3, 4] as const
const BOOKING_KINDS = new Set<Occupancy['kind']>(['booking', 'recurring', 'match'])

const total = (payments: HomePayment[]) => payments.reduce((sum, payment) => sum + payment.amount, 0)

export function playerLabel(player: Pick<PlayerShare, 'position' | 'name'>): string {
  return player.name ?? `Jugador ${player.position}`
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
      return [{ ...base, kind: 'event', label: occupancy.note ?? KIND_LABELS[occupancy.kind], href: eventHref(occupancy) }]
    })
}

// En cancha ahora: started (at `now` included) and not ended. Próximos: starts within 90 minutes. Pendientes de
// cobro: a booking that ended (at `now` included) and still owes something.
export function homeSections(items: CourtItem[], now: Date): HomeSections {
  const time = now.getTime()
  const horizon = time + UPCOMING_MINUTES * 60_000
  return {
    playing: items.filter((item) => item.startsAt.getTime() <= time && time < item.endsAt.getTime()),
    upcoming: items.filter((item) => item.startsAt.getTime() > time && item.startsAt.getTime() <= horizon),
    pending: items.filter(
      (item): item is CourtTurn => item.kind === 'turn' && item.endsAt.getTime() <= time && item.restDue > 0,
    ),
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

// "Lo que pasa hoy": short lines with a link; nothing for what does not happen.
export function todayLines(input: {
  forming: number
  competitions: Competition[]
  inside: number
  waiting: number
}): TodayLine[] {
  const lines: TodayLine[] = []
  if (input.forming > 0) {
    lines.push({ text: plural(input.forming, 'partido armándose', 'partidos armándose'), href: '/club/grilla' })
  }
  for (const competition of input.competitions) {
    lines.push(
      competition.kind === 'tournament'
        ? { text: `Torneo ${competition.name}`, href: `/club/torneos/${competition.id}` }
        : { text: `Campeonato ${competition.name}`, href: `/club/torneos/campeonatos/${competition.id}` },
    )
  }
  if (input.inside > 0) lines.push({ text: `${input.inside} en el club hoy`, href: '/club/day-use' })
  if (input.waiting > 0) lines.push({ text: `${input.waiting} esperando turno hoy`, href: '/club/grilla' })
  return lines
}

// "3 transferencias por confirmar · $4.800", or nothing.
export function transfersLine(totals: { count: number; total: number }): string | null {
  if (totals.count === 0) return null
  return `${plural(totals.count, 'transferencia por confirmar', 'transferencias por confirmar')} · ${formatPrice(totals.total)}`
}

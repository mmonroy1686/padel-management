import { errorMessage } from './errors'
import { readUuid } from './input'
import type { ParseResult } from './settings'

// The result of a played booking: two pairs out of its 4 positions and the games of each set (design:
// docs/features/historial-jugador/design.md).

export type ResultPlayer = { position: number; name: string; team: 'a' | 'b' | null; isMe: boolean }
export type BookingResult = { teamA: number[]; gamesA: number[]; gamesB: number[] }
export type PlayedBooking = {
  bookingId: string
  startsAt: Date
  courtName: string
  players: ResultPlayer[]
  result: BookingResult | null
}

export const MAX_SETS = 3

// The pair a new result starts from: the open match's teams, or the holder with position 2.
export function defaultTeamA(players: ResultPlayer[]): number[] {
  const fromMatch = players.filter((player) => player.team === 'a').map((player) => player.position)
  return fromMatch.length === 2 ? fromMatch : [1, 2]
}

export function hasFourPlayers(players: ResultPlayer[]): boolean {
  return new Set(players.map((player) => player.position).filter((position) => position >= 1 && position <= 4)).size === 4
}

const namesOf = (players: ResultPlayer[], positions: number[]) =>
  positions.map((position) => players.find((player) => player.position === position)?.name ?? '—')

// The result as one side sees it: "Ganaste 6-4 3-6 7-5 con Bruno contra Pedro y Juan". Without a viewer in the
// booking (staff), from pair A's side.
export function resultView(players: ResultPlayer[], result: BookingResult): {
  won: boolean
  sets: string
  partners: string[]
  rivals: string[]
  mine: boolean
  // For whoever was not there (staff): the winners and the sets from their side.
  winners: string
  winnerSets: string
} {
  const me = players.find((player) => player.isMe)
  const inA = me ? result.teamA.includes(me.position) : true
  const teamB = players.map((player) => player.position).filter((position) => !result.teamA.includes(position))
  const ours = inA ? result.teamA : teamB
  const theirs = inA ? teamB : result.teamA
  const setsWonA = result.gamesA.filter((games, index) => games > result.gamesB[index]).length
  const wonA = setsWonA > result.gamesA.length - setsWonA
  const sets = result.gamesA
    .map((games, index) => (inA ? `${games}-${result.gamesB[index]}` : `${result.gamesB[index]}-${games}`))
    .join(' ')
  const winnerTeam = wonA ? result.teamA : teamB
  const winnerSets = result.gamesA
    .map((games, index) => (wonA ? `${games}-${result.gamesB[index]}` : `${result.gamesB[index]}-${games}`))
    .join(' ')
  return {
    winners: namesOf(players, winnerTeam).join(' y '),
    winnerSets,
    won: inA ? wonA : !wonA,
    sets,
    partners: namesOf(players, ours).filter((_, index) => !me || ours[index] !== me.position),
    rivals: namesOf(players, theirs),
    mine: Boolean(me),
  }
}

export function historyStats(played: PlayedBooking[]): { played: number; withResult: number; won: number; lost: number } {
  const results = played.filter((booking) => booking.result !== null)
  const won = results.filter((booking) => booking.result && resultView(booking.players, booking.result).won).length
  return { played: played.length, withResult: results.length, won, lost: results.length - won }
}

export type ResultInput = { bookingId: string; teamA: number[]; gamesA: number[]; gamesB: number[] }

// The form: who the anchor (the viewer, or the holder for staff) played with, and up to 3 sets; a set left empty
// is not played. The database checks the rest again.
export function parseResultForm(form: FormData): ParseResult<ResultInput> {
  const bookingId = readUuid(form, 'bookingId')
  const anchor = Number(form.get('anchor'))
  const partner = Number(form.get('partner'))
  if (!bookingId || ![1, 2, 3, 4].includes(anchor)) return { ok: false, message: errorMessage('invalid_input') }
  if (![1, 2, 3, 4].includes(partner) || partner === anchor) return { ok: false, message: 'Elegí con quién jugó.' }
  const gamesA: number[] = []
  const gamesB: number[] = []
  for (let set = 1; set <= MAX_SETS; set++) {
    const a = String(form.get(`a${set}`) ?? '').trim()
    const b = String(form.get(`b${set}`) ?? '').trim()
    if (a === '' && b === '') continue
    const ga = Number(a)
    const gb = Number(b)
    if (a === '' || b === '' || !Number.isInteger(ga) || !Number.isInteger(gb) || ga < 0 || gb < 0 || ga > 30 || gb > 30) {
      return { ok: false, message: `Revisá el set ${set}: los games de las dos parejas.` }
    }
    if (ga === gb) return { ok: false, message: `El set ${set} tiene que tener un ganador.` }
    gamesA.push(ga)
    gamesB.push(gb)
  }
  if (gamesA.length === 0) return { ok: false, message: 'Cargá al menos un set.' }
  const wonA = gamesA.filter((games, index) => games > gamesB[index]).length
  if (wonA * 2 === gamesA.length) return { ok: false, message: errorMessage('invalid_sets') }
  return { ok: true, value: { bookingId, teamA: [anchor, partner].sort(), gamesA, gamesB } }
}

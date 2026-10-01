import { formatPrice } from './format'
import { categoryRangeLabel, MATCH_TYPE_LABELS, overlaps, type MatchPlayer, type MatchType, type Period } from './matches'
import type { PaymentStatus } from './payments'
import { toDate } from './time'

export const TOURNAMENT_SIZES = [8, 12, 16] as const
export type TournamentStatus = 'registration' | 'closed' | 'in_progress' | 'finished' | 'cancelled'

// What "Nuevo americano" proposes (design, open question: Rustic's real numbers).
export const TOURNAMENT_DEFAULTS = { maxPlayers: 8, pointsPerGame: 24, roundMinutes: 20, rounds: 7, price: 400 } as const

export const TOURNAMENT_STATUS_LABELS: Record<TournamentStatus, string> = {
  registration: 'Inscripción abierta',
  closed: 'Inscripción cerrada',
  in_progress: 'En juego',
  finished: 'Finalizado',
  cancelled: 'Cancelado',
}

export type EntryPayment = { status: PaymentStatus; amount: number; rejection_reason: string | null; created_at: string }
export type TournamentEntry = { id: string; playerId: string | null; name: string; isGuest: boolean; payments: EntryPayment[] }
// Team A is teamA[0] + teamA[1]; scoreA is their points, team B has the rest (tournament-ranking.ts).
export type TournamentGame = {
  id: string
  round: number
  wave: number
  courtId: string
  courtName: string
  startsAt: Date
  teamA: [string, string]
  teamB: [string, string]
  scoreA: number | null
}
export type Tournament = Period & {
  id: string
  name: string
  courtIds: string[]
  courtNames: string[]
  maxPlayers: number
  pointsPerGame: number
  roundMinutes: number
  rounds: number
  categoryMin: number
  categoryMax: number
  type: MatchType
  price: number
  status: TournamentStatus
  // Only the ones still in; payments come back only to their payer and to staff (RLS).
  entries: TournamentEntry[]
  games: TournamentGame[]
}

// What lib/data/tournaments.ts reads. If supabase-js infers a slightly different shape for the
// embeds, adjust this type to match; never cast the query result.
export type TournamentRow = {
  id: string
  name: string
  starts_at: string | null
  ends_at: string | null
  court_ids: string[]
  max_players: number
  points_per_game: number
  round_minutes: number
  rounds: number
  category_min: number
  category_max: number
  match_type: MatchType
  price: number
  status: TournamentStatus
  entries: {
    id: string
    player_id: string | null
    guest_name: string | null
    removed_at: string | null
    created_at: string
    player: { display_name: string } | null
    payments: EntryPayment[]
  }[]
  games: {
    id: string
    round: number
    wave: number
    court_id: string
    starts_at: string
    a1_entry_id: string
    a2_entry_id: string
    b1_entry_id: string
    b2_entry_id: string
    score_a: number | null
  }[]
}

export function toTournament(row: TournamentRow, courtNames: Map<string, string>): Tournament {
  const courtName = (id: string) => courtNames.get(id) ?? 'Cancha'
  const courtOrder = (id: string) => row.court_ids.indexOf(id)
  return {
    id: row.id,
    name: row.name,
    startsAt: toDate(row.starts_at),
    endsAt: toDate(row.ends_at),
    courtIds: row.court_ids,
    courtNames: row.court_ids.map(courtName),
    maxPlayers: row.max_players,
    pointsPerGame: row.points_per_game,
    roundMinutes: row.round_minutes,
    rounds: row.rounds,
    categoryMin: row.category_min,
    categoryMax: row.category_max,
    type: row.match_type,
    price: row.price,
    status: row.status,
    entries: row.entries
      .filter((entry) => entry.removed_at === null)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((entry) => ({
        id: entry.id,
        playerId: entry.player_id,
        // A private profile is not readable by other members (RLS): the entry shows it is taken.
        name: entry.guest_name ?? entry.player?.display_name ?? 'Jugador',
        isGuest: entry.player_id === null,
        payments: entry.payments,
      })),
    games: row.games
      .map((game) => ({
        id: game.id,
        round: game.round,
        wave: game.wave,
        courtId: game.court_id,
        courtName: courtName(game.court_id),
        startsAt: toDate(game.starts_at),
        teamA: [game.a1_entry_id, game.a2_entry_id] as [string, string],
        teamB: [game.b1_entry_id, game.b2_entry_id] as [string, string],
        scoreA: game.score_a,
      }))
      .sort((a, b) => a.round - b.round || a.wave - b.wave || courtOrder(a.courtId) - courtOrder(b.courtId)),
  }
}

// Same as private.tournament_minutes: the games of a round (players / 4) spread over the courts in waves.
export function wavesFor(players: number, courts: number): number {
  return Math.ceil(players / 4 / Math.max(1, courts))
}

export function tournamentMinutes(shape: { players: number; courts: number; rounds: number; roundMinutes: number }): number {
  return shape.rounds * wavesFor(shape.players, shape.courts) * shape.roundMinutes
}

export function spotsLabel(tournament: Pick<Tournament, 'status' | 'entries' | 'maxPlayers'>): string {
  if (tournament.status === 'registration' || tournament.status === 'closed') {
    return `${tournament.entries.length} de ${tournament.maxPlayers}`
  }
  return TOURNAMENT_STATUS_LABELS[tournament.status]
}

export function courtsText(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

export function formatText(tournament: Pick<Tournament, 'rounds' | 'roundMinutes' | 'pointsPerGame'>): string {
  return `${tournament.rounds} rondas de ${tournament.roundMinutes} min, a ${tournament.pointsPerGame} puntos`
}

export function openTournamentsText(count: number): string {
  if (count === 0) return 'Ahora no hay torneos con inscripción abierta.'
  return `Torneos: ${count} con inscripción abierta`
}

export function myEntry(tournament: Pick<Tournament, 'entries'>, playerId: string): TournamentEntry | null {
  return tournament.entries.find((entry) => entry.playerId === playerId) ?? null
}

export function entryNames(tournament: Pick<Tournament, 'entries'>): Map<string, string> {
  return new Map(tournament.entries.map((entry) => [entry.id, entry.name]))
}

export function teamName(team: [string, string], names: Map<string, string>): string {
  return team.map((id) => names.get(id) ?? 'Jugador').join(' y ')
}

export function gamesByRound(games: TournamentGame[]): { round: number; games: TournamentGame[] }[] {
  const rounds = new Map<number, TournamentGame[]>()
  for (const game of games) rounds.set(game.round, [...(rounds.get(game.round) ?? []), game])
  return [...rounds.entries()].sort(([a], [b]) => a - b).map(([round, inRound]) => ({ round, games: inRound }))
}

export function missingScores(games: TournamentGame[]): number {
  return games.filter((game) => game.scoreA === null).length
}

// The round reception is on: the first one with a result missing, or the last one once all are in.
export function currentRound(games: TournamentGame[]): number | null {
  if (games.length === 0) return null
  const missing = games.filter((game) => game.scoreA === null).map((game) => game.round)
  return missing.length > 0 ? Math.min(...missing) : Math.max(...games.map((game) => game.round))
}

export type EntryContext = { now: Date; busy: Period[] }
export type EntryStatus = { ok: true; text: string } | { ok: false; text: string }

const no = (text: string): EntryStatus => ({ ok: false, text })

// Same rules and order as join_tournament (with "already in" first, as the cards need it).
export function entryStatus(tournament: Tournament, player: MatchPlayer, context: EntryContext): EntryStatus {
  if (myEntry(tournament, player.id)) return no('Ya estás anotado.')
  if (tournament.status !== 'registration' || tournament.startsAt <= context.now) return no('La inscripción está cerrada.')
  if (tournament.entries.length >= tournament.maxPlayers) return no('Ya no quedan lugares.')
  const range = categoryRangeLabel(tournament.categoryMin, tournament.categoryMax)
  if (player.category === null) return no(`Es para ${range} y todavía no tenés categoría.`)
  if (player.category < tournament.categoryMin || player.category > tournament.categoryMax) {
    return no(`Es para ${range} y vos sos ${player.category}ª.`)
  }
  if (tournament.type !== 'mixed' && player.gender !== tournament.type) {
    return no(`Es un torneo ${MATCH_TYPE_LABELS[tournament.type].toLowerCase()}.`)
  }
  if (context.busy.some((period) => overlaps(period, tournament))) {
    return no('Ya tenés una reserva, un partido o un torneo a esa hora.')
  }
  return { ok: true, text: tournament.price > 0 ? `Inscribirme, ${formatPrice(tournament.price)}` : 'Inscribirme' }
}

export type TournamentLeaveStatus = { allowed: true } | { allowed: false; reason: string } | null

// Same rule as leave_tournament: only while registration is open.
export function tournamentLeaveStatus(tournament: Tournament, playerId: string): TournamentLeaveStatus {
  if (!myEntry(tournament, playerId) || tournament.status === 'finished' || tournament.status === 'cancelled') return null
  if (tournament.status !== 'registration') {
    return { allowed: false, reason: 'La inscripción ya cerró: para bajarte, avisá al club.' }
  }
  return { allowed: true }
}

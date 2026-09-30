import type { Tournament, TournamentEntry, TournamentGame } from '@/lib/domain/tournaments'
import { at } from './grid'

// Players 1..count, all members, nobody paid yet.
export function makeEntries(count: number): TournamentEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `e${index + 1}`,
    playerId: `p${index + 1}`,
    name: `Jugador ${index + 1}`,
    isGuest: false,
    payments: [],
  }))
}

// Thursday 2026-10-01 (the grid fixture's day) 18:00 to 20:20, Cancha 1 and 2, mixed 4ª a 6ª,
// 8 players, 7 rounds of 20 minutes to 24 points, $400. Five signed up.
export function makeTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: 't1',
    name: 'Americano de octubre',
    startsAt: at('18:00'),
    endsAt: at('20:20'),
    courtIds: ['court-1', 'court-2'],
    courtNames: ['Cancha 1', 'Cancha 2'],
    maxPlayers: 8,
    pointsPerGame: 24,
    roundMinutes: 20,
    rounds: 7,
    categoryMin: 4,
    categoryMax: 6,
    type: 'mixed',
    price: 400,
    status: 'registration',
    entries: makeEntries(5),
    games: [],
    ...overrides,
  }
}

export function makeGame(
  id: string,
  teamA: [string, string],
  teamB: [string, string],
  scoreA: number | null,
  overrides: Partial<TournamentGame> = {},
): TournamentGame {
  return { id, round: 1, wave: 1, courtId: 'court-1', courtName: 'Cancha 1', startsAt: at('18:00'), teamA, teamB, scoreA, ...overrides }
}

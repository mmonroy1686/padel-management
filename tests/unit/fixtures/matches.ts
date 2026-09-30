import type { JoinContext, Match, MatchPlayer } from '@/lib/domain/matches'
import { at } from './grid'

// Thursday 2026-10-01 20:00 (the grid fixture's day), Cancha 1, mixed 4ª a 6ª, $1.600.
// Ana is on spot 1 (team A drive); spots 2, 3 and 4 are free.
export function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 'm1',
    startsAt: at('20:00'),
    endsAt: at('21:30'),
    preferredCourtId: 'court-1',
    preferredCourtName: 'Cancha 1',
    courtId: null,
    courtName: null,
    allowOtherCourt: true,
    categoryMin: 4,
    categoryMax: 6,
    type: 'mixed',
    status: 'forming',
    cancelReason: null,
    bookingId: null,
    price: 1600,
    slots: [
      { position: 1, side: 'drive', playerId: 'ana', playerName: 'Ana Pérez' },
      { position: 2, side: 'backhand', playerId: null, playerName: null },
      { position: 3, side: 'drive', playerId: null, playerName: null },
      { position: 4, side: 'backhand', playerId: null, playerName: null },
    ],
    ...overrides,
  }
}

// Fills spots by position: players[0] goes to spot 1, and so on; null leaves it free.
export function withPlayers(match: Match, players: (string | null)[]): Match {
  return {
    ...match,
    slots: match.slots.map((slot, index) => ({
      ...slot,
      playerId: players[index] ?? null,
      playerName: players[index] ? `Jugador ${players[index]}` : null,
    })),
  }
}

export const BRUNO: MatchPlayer = { id: 'bruno', category: 5, gender: 'male', side: 'backhand' }
export const CONTEXT: JoinContext = { now: at('08:00'), closeHours: 3, busy: [] }

import { describe, expect, it } from 'vitest'
import {
  courtsText,
  entryNames,
  entryStatus,
  formatText,
  gamesByRound,
  missingScores,
  myEntry,
  openTournamentsText,
  spotsLabel,
  teamName,
  toTournament,
  tournamentLeaveStatus,
  tournamentMinutes,
  type TournamentRow,
} from '@/lib/domain/tournaments'
import { at } from '../../fixtures/grid'
import { BRUNO } from '../../fixtures/matches'
import { makeEntries, makeGame, makeTournament } from '../../fixtures/tournaments'

const ROW: TournamentRow = {
  id: 't1',
  name: 'Americano de octubre',
  starts_at: '2026-10-01T21:00:00+00:00',
  ends_at: '2026-10-01T23:20:00+00:00',
  court_ids: ['court-2', 'court-1'],
  max_players: 8,
  points_per_game: 24,
  round_minutes: 20,
  rounds: 7,
  category_min: 4,
  category_max: 6,
  match_type: 'mixed',
  price: 400,
  status: 'in_progress',
  entries: [
    { id: 'e2', player_id: null, guest_name: 'Pepe', removed_at: null, created_at: '2026-09-30T12:00:02Z', player: null, payments: [] },
    { id: 'e1', player_id: 'p1', guest_name: null, removed_at: null, created_at: '2026-09-30T12:00:01Z', player: { display_name: 'Ana Pérez' }, payments: [] },
    { id: 'e3', player_id: 'p3', guest_name: null, removed_at: null, created_at: '2026-09-30T12:00:03Z', player: null, payments: [] },
    { id: 'e4', player_id: 'p4', guest_name: null, removed_at: '2026-09-30T13:00:00Z', created_at: '2026-09-30T12:00:04Z', player: { display_name: 'Se fue' }, payments: [] },
  ],
  games: [
    { id: 'g2', round: 1, wave: 1, court_id: 'court-1', starts_at: '2026-10-01T21:00:00+00:00', a1_entry_id: 'e1', a2_entry_id: 'e2', b1_entry_id: 'e3', b2_entry_id: 'e5', score_a: null },
    { id: 'g1', round: 1, wave: 1, court_id: 'court-2', starts_at: '2026-10-01T21:00:00+00:00', a1_entry_id: 'e6', a2_entry_id: 'e7', b1_entry_id: 'e8', b2_entry_id: 'e9', score_a: 14 },
  ],
}
const COURT_NAMES = new Map([['court-1', 'Cancha 1'], ['court-2', 'Cancha 2']])
const CONTEXT = { now: at('08:00'), busy: [] }

describe('toTournament', () => {
  it('keeps who is still in, in sign-up order, with guest names and private profiles as "Jugador"', () => {
    const tournament = toTournament(ROW, COURT_NAMES)
    expect(tournament.entries.map((entry) => [entry.id, entry.name, entry.isGuest])).toEqual([
      ['e1', 'Ana Pérez', false],
      ['e2', 'Pepe', true],
      ['e3', 'Jugador', false],
    ])
    expect(tournament.startsAt).toEqual(new Date('2026-10-01T21:00:00Z'))
    expect(tournament.type).toBe('mixed')
  })

  it('names the courts and sorts the games by round, wave and court order', () => {
    const tournament = toTournament(ROW, COURT_NAMES)
    expect(tournament.courtNames).toEqual(['Cancha 2', 'Cancha 1'])
    expect(tournament.games.map((game) => [game.id, game.courtName, game.teamA, game.scoreA])).toEqual([
      ['g1', 'Cancha 2', ['e6', 'e7'], 14],
      ['g2', 'Cancha 1', ['e1', 'e2'], null],
    ])
  })
})

describe('tournamentMinutes', () => {
  it('is rounds times waves times minutes per round', () => {
    expect(tournamentMinutes({ players: 8, courts: 2, rounds: 7, roundMinutes: 20 })).toBe(140)
    expect(tournamentMinutes({ players: 12, courts: 2, rounds: 7, roundMinutes: 20 })).toBe(280)
    expect(tournamentMinutes({ players: 16, courts: 4, rounds: 7, roundMinutes: 20 })).toBe(140)
    expect(tournamentMinutes({ players: 16, courts: 3, rounds: 7, roundMinutes: 20 })).toBe(280)
  })
})

describe('labels', () => {
  it('shows how full it is while signing up, and the stage after', () => {
    expect(spotsLabel(makeTournament())).toBe('5 de 8')
    expect(spotsLabel(makeTournament({ status: 'closed', entries: makeEntries(8) }))).toBe('8 de 8')
    expect(spotsLabel(makeTournament({ status: 'in_progress' }))).toBe('En juego')
    expect(spotsLabel(makeTournament({ status: 'finished' }))).toBe('Finalizado')
  })

  it('lists courts and the format in words', () => {
    expect(courtsText(['Cancha 1'])).toBe('Cancha 1')
    expect(courtsText(['Cancha 1', 'Cancha 2'])).toBe('Cancha 1 y Cancha 2')
    expect(courtsText(['Cancha 1', 'Cancha 2', 'Cancha 3'])).toBe('Cancha 1, Cancha 2 y Cancha 3')
    expect(formatText(makeTournament())).toBe('7 rondas de 20 min, a 24 puntos')
  })

  it('counts the tournaments open for sign-up', () => {
    expect(openTournamentsText(0)).toBe('Ahora no hay torneos con inscripción abierta.')
    expect(openTournamentsText(1)).toBe('Torneos: 1 con inscripción abierta')
    expect(openTournamentsText(3)).toBe('Torneos: 3 con inscripción abierta')
  })
})

describe('entryStatus', () => {
  it('lets a player in the category sign up, with the price', () => {
    expect(entryStatus(makeTournament(), BRUNO, CONTEXT)).toEqual({ ok: true, text: 'Inscribirme, $400' })
    expect(entryStatus(makeTournament({ price: 0 }), BRUNO, CONTEXT)).toEqual({ ok: true, text: 'Inscribirme' })
  })

  it('says why not, in the same order as join_tournament', () => {
    const entered = makeTournament({ entries: [...makeEntries(2), { id: 'eb', playerId: 'bruno', name: 'Bruno', isGuest: false, payments: [] }] })
    expect(entryStatus(entered, BRUNO, CONTEXT).text).toBe('Ya estás anotado.')
    expect(entryStatus(makeTournament({ status: 'closed' }), BRUNO, CONTEXT).text).toBe('La inscripción está cerrada.')
    expect(entryStatus(makeTournament(), BRUNO, { ...CONTEXT, now: at('18:00') }).text).toBe('La inscripción está cerrada.')
    expect(entryStatus(makeTournament({ entries: makeEntries(8) }), BRUNO, CONTEXT).text).toBe('Ya no quedan lugares.')
    expect(entryStatus(makeTournament(), { ...BRUNO, category: null }, CONTEXT).text).toBe('Es para 4ª a 6ª y todavía no tenés categoría.')
    expect(entryStatus(makeTournament(), { ...BRUNO, category: 7 }, CONTEXT).text).toBe('Es para 4ª a 6ª y vos sos 7ª.')
    expect(entryStatus(makeTournament({ type: 'female' }), BRUNO, CONTEXT).text).toBe('Es un torneo femenino.')
    expect(
      entryStatus(makeTournament(), BRUNO, { ...CONTEXT, busy: [{ startsAt: at('19:00'), endsAt: at('20:30') }] }).text,
    ).toBe('Ya tenés una reserva, un partido o un torneo a esa hora.')
  })
})

describe('tournamentLeaveStatus', () => {
  it('lets a player leave only while registration is open', () => {
    const entries = [...makeEntries(2), { id: 'eb', playerId: 'bruno', name: 'Bruno', isGuest: false, payments: [] }]
    expect(tournamentLeaveStatus(makeTournament({ entries }), 'bruno')).toEqual({ allowed: true })
    expect(tournamentLeaveStatus(makeTournament({ entries, status: 'closed' }), 'bruno')).toEqual({
      allowed: false,
      reason: 'La inscripción ya cerró: para bajarte, avisá al club.',
    })
    expect(tournamentLeaveStatus(makeTournament({ entries, status: 'finished' }), 'bruno')).toBeNull()
    expect(tournamentLeaveStatus(makeTournament(), 'bruno')).toBeNull()
  })
})

describe('entries and games', () => {
  it('finds the viewer and names each team', () => {
    const tournament = makeTournament()
    expect(myEntry(tournament, 'p2')?.id).toBe('e2')
    expect(myEntry(tournament, 'nobody')).toBeNull()
    expect(teamName(['e1', 'e2'], entryNames(tournament))).toBe('Jugador 1 y Jugador 2')
    expect(teamName(['e1', 'gone'], entryNames(tournament))).toBe('Jugador 1 y Jugador')
  })

  it('groups games by round and counts the missing results', () => {
    const games = [
      makeGame('g1', ['e1', 'e2'], ['e3', 'e4'], 14),
      makeGame('g2', ['e5', 'e6'], ['e7', 'e8'], null),
      makeGame('g3', ['e1', 'e3'], ['e2', 'e4'], null, { round: 2 }),
    ]
    expect(gamesByRound(games).map(({ round, games: inRound }) => [round, inRound.map((game) => game.id)])).toEqual([
      [1, ['g1', 'g2']],
      [2, ['g3']],
    ])
    expect(missingScores(games)).toBe(2)
  })
})

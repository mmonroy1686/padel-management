import { beforeEach, describe, expect, it, vi } from 'vitest'
import { INVALID_INPUT } from '@/lib/actions/result'

// Server Actions are reachable by any POST: bad input must stop before any RPC.
type RpcResult = { data: unknown; error: { message: string } | null }
const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<RpcResult>>(async () => ({
  data: { id: 't-new' },
  error: null,
}))
const redirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT ${path}`)
})

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ redirect: (path: string) => redirect(path) }))
vi.mock('@/lib/actions/revalidate', () => ({ revalidateBookings: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))
vi.mock('@/lib/auth/viewer', () => ({
  getViewer: async () => ({ userId: 'u1', club: { id: 'club-1', timezone: 'America/Montevideo' } }),
}))

const club = await import('@/app/(club)/club/torneos/actions')
const player = await import('@/app/(jugador)/torneos/actions')
const { errorMessage } = await import('@/lib/domain/errors')

const ID = '55555555-5555-5555-5555-555555555555'
const C1 = '22222222-2222-2222-2222-222222222201'
const C2 = '22222222-2222-2222-2222-222222222202'
const IDLE = { status: 'idle' as const }
const VALID = {
  name: 'Americano de octubre',
  date: '2026-10-01',
  time: '18:00',
  courtIds: [C1, C2],
  maxPlayers: '8',
  pointsPerGame: '24',
  roundMinutes: '20',
  rounds: '7',
  categoryMin: '4',
  categoryMax: '6',
  type: 'mixed',
  price: '400',
}

function form(entries: Record<string, string | string[]>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item)
  }
  return data
}

beforeEach(() => {
  rpc.mockClear()
  redirect.mockClear()
})

describe('createTournament', () => {
  it('explains bad input without calling the database', async () => {
    expect(await club.createTournament(IDLE, form({ ...VALID, maxPlayers: '10' }))).toEqual({
      status: 'error',
      message: 'El cupo es de 8, 12 o 16 jugadores.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('creates it with the club clock and opens its page', async () => {
    await expect(club.createTournament(IDLE, form(VALID))).rejects.toThrow('NEXT_REDIRECT /club/torneos/t-new')
    expect(rpc).toHaveBeenCalledWith('create_tournament', {
      p_name: 'Americano de octubre',
      p_starts_at: '2026-10-01T21:00:00.000Z',
      p_court_ids: [C1, C2],
      p_max_players: 8,
      p_points_per_game: 24,
      p_round_minutes: 20,
      p_rounds: 7,
      p_category_min: 4,
      p_category_max: 6,
      p_type: 'mixed',
      p_price: 400,
    })
  })

  it('translates what the database says', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'courts_busy' } })
    expect(await club.createTournament(IDLE, form(VALID))).toEqual({ status: 'error', message: errorMessage('courts_busy') })
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe('tournament actions', () => {
  it('reject ids and numbers that do not have the right shape', async () => {
    const bad = form({ tournamentId: 't1', entryId: 'e1', gameId: 'g1' })
    for (const action of [
      club.closeRegistration,
      club.reopenRegistration,
      club.startTournament,
      club.finishTournament,
      club.cancelTournament,
      club.addGuest,
      club.removeEntry,
      club.recordScore,
      club.recordTournamentCash,
      player.joinTournament,
      player.leaveTournament,
    ]) {
      expect(await action(IDLE, bad)).toEqual(INVALID_INPUT)
    }
    expect(await club.recordScore(IDLE, form({ gameId: ID, scoreA: 'diez' }))).toEqual(INVALID_INPUT)
    expect(await club.recordTournamentCash(IDLE, form({ entryId: ID, amount: '0' }))).toEqual(INVALID_INPUT)
    expect(await club.addGuest(IDLE, form({ tournamentId: ID, guestName: '' }))).toEqual(INVALID_INPUT)
    expect(await player.reportTournamentTransfer('e1', null)).toEqual(INVALID_INPUT)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('call each function with its arguments', async () => {
    await club.closeRegistration(IDLE, form({ tournamentId: ID }))
    await club.startTournament(IDLE, form({ tournamentId: ID }))
    await club.addGuest(IDLE, form({ tournamentId: ID, guestName: 'Pepe' }))
    await club.removeEntry(IDLE, form({ entryId: ID }))
    await club.recordScore(IDLE, form({ gameId: ID, scoreA: '14' }))
    await club.recordTournamentCash(IDLE, form({ entryId: ID, amount: '400' }))
    await player.joinTournament(IDLE, form({ tournamentId: ID }))
    await player.reportTournamentTransfer(ID, 'u1/recibo.png')
    expect(rpc.mock.calls).toEqual([
      ['close_tournament_registration', { p_tournament_id: ID }],
      ['start_tournament', { p_tournament_id: ID }],
      ['add_tournament_guest', { p_tournament_id: ID, p_name: 'Pepe' }],
      ['remove_tournament_entry', { p_entry_id: ID }],
      ['record_tournament_score', { p_game_id: ID, p_score_a: 14 }],
      ['record_tournament_cash', { p_entry_id: ID, p_amount: 400 }],
      ['join_tournament', { p_tournament_id: ID }],
      ['report_tournament_transfer', { p_entry_id: ID, p_receipt_path: 'u1/recibo.png' }],
    ])
  })

  it('say what happened', async () => {
    expect(await club.startTournament(IDLE, form({ tournamentId: ID }))).toEqual({ status: 'ok', message: 'Fixture armado. ¡A jugar!' })
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'not_enough_players' } })
    expect(await club.startTournament(IDLE, form({ tournamentId: ID }))).toEqual({
      status: 'error',
      message: errorMessage('not_enough_players'),
    })
  })
})

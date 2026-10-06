import { beforeEach, describe, expect, it, vi } from 'vitest'
import { INVALID_INPUT } from '@/lib/actions/result'
import type { Fixture } from '@/lib/domain/championship-fixture'
import { BRUNO, LUCIA, makeCategory, makeChampionship, makeEntry } from '../../fixtures/championships'
import { makeGroup, makeMatch, members, set } from '../../fixtures/championship-fixture'

// Server Actions are reachable by any POST: bad input must stop before any RPC.
type RpcResult = { data: unknown; error: { message: string } | null }
const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<RpcResult>>(async () => ({
  data: null,
  error: null,
}))
const loadChampionship = vi.fn()
const loadFixture = vi.fn<(championshipId: string) => Promise<Fixture>>()

vi.mock('server-only', () => ({}))
vi.mock('@/lib/actions/revalidate', () => ({ revalidateBookings: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))
vi.mock('@/lib/auth/viewer', () => ({
  getViewer: async () => ({ userId: 'u1', club: { id: 'club-1', timezone: 'America/Montevideo' } }),
}))
vi.mock('@/lib/data/championships', () => ({ loadChampionship: (...args: unknown[]) => loadChampionship(...args) }))
vi.mock('@/lib/data/championship-fixture', () => ({ loadFixture: (id: string) => loadFixture(id) }))

const actions = await import('@/app/(club)/club/torneos/campeonatos/fixture-actions')

const ID = '11111111-1111-1111-1111-111111111111'
const MATCH = '33333333-3333-3333-3333-333333333333'
const COURT = '44444444-4444-4444-4444-444444444444'
const IDLE = { status: 'idle' as const }
const CHAMPIONSHIP = makeChampionship({
  categories: [
    makeCategory({ entries: [makeEntry({ id: 'e1' }), makeEntry({ id: 'e2', player1: BRUNO, player2: LUCIA })] }),
  ],
})

function form(entries: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) data.append(key, value)
  return data
}

beforeEach(() => {
  rpc.mockClear()
  loadChampionship.mockReset()
  loadFixture.mockReset()
  loadChampionship.mockResolvedValue(CHAMPIONSHIP)
})

describe('the draw and the schedule', () => {
  it('draws the open categories and sends the draw to the database', async () => {
    expect(await actions.drawFixture(IDLE, form({ championshipId: 'nope' }))).toEqual(INVALID_INPUT)
    expect(rpc).not.toHaveBeenCalled()
    expect(await actions.drawFixture(IDLE, form({ championshipId: ID }))).toMatchObject({ status: 'ok' })
    expect(rpc).toHaveBeenCalledWith('save_championship_draw', {
      p_championship_id: ID,
      p_seed: expect.any(Number),
      p_draw: [expect.objectContaining({ category_id: 'k1' })],
    })
  })

  it('says which category cannot be drawn', async () => {
    loadChampionship.mockResolvedValue(makeChampionship({ categories: [makeCategory({ entries: [makeEntry()] })] }))
    expect(await actions.drawFixture(IDLE, form({ championshipId: ID }))).toEqual({
      status: 'error',
      message: '6ta Libre: Hacen falta al menos 2 parejas para sortear.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('schedules every match and sends the slots', async () => {
    loadFixture.mockResolvedValue({ groups: [makeGroup({ members: members(['e1', 'e2']) })], matches: [makeMatch()] })
    expect(await actions.scheduleFixture(IDLE, form({ championshipId: ID }))).toEqual({
      status: 'ok',
      message: 'Listo: el partido tiene cancha y horario.',
    })
    expect(rpc).toHaveBeenCalledWith('save_championship_schedule', {
      p_championship_id: ID,
      p_slots: [{ match_id: 'm1', court_id: 'court-1', starts_at: '2026-10-17T11:00:00.000Z' }],
    })
  })

  it('moves a match to the court and start chosen', async () => {
    await actions.moveMatch(IDLE, form({ matchId: MATCH, slot: `${COURT}|2026-10-17T14:00:00.000Z` }))
    expect(rpc).toHaveBeenCalledWith('set_match_slot', {
      p_match_id: MATCH,
      p_court_id: COURT,
      p_starts_at: '2026-10-17T14:00:00.000Z',
    })
  })

  it('publishes, giving back the free slots when asked', async () => {
    await actions.publishFixture(IDLE, form({ championshipId: ID, releaseFree: 'on' }))
    expect(rpc).toHaveBeenCalledWith('publish_championship', { p_championship_id: ID, p_release_free: true })
  })
})

describe('the tournament day', () => {
  it('rejects a score the rules do not allow, before any RPC', async () => {
    loadFixture.mockResolvedValue({ groups: [], matches: [makeMatch({ id: MATCH })] })
    expect(
      await actions.recordResult(IDLE, form({ championshipId: ID, matchId: MATCH, a1: '6', b1: '5', a2: '6', b2: '4' })),
    ).toEqual({ status: 'error', message: 'El set 1 no es un resultado posible: termina 6-0 a 6-4, 7-5 o 7-6.' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('records a result and closes the group when it is complete', async () => {
    const group = makeGroup({ members: members(['e1', 'e2']) })
    loadFixture
      .mockResolvedValueOnce({ groups: [group], matches: [makeMatch({ id: MATCH })] })
      .mockResolvedValueOnce({
        groups: [group],
        matches: [makeMatch({ id: MATCH, status: 'finished', winner: 'e1', sets: [set(6, 3), set(6, 4)] })],
      })
    expect(
      await actions.recordResult(IDLE, form({ championshipId: ID, matchId: MATCH, a1: '6', b1: '3', a2: '6', b2: '4' })),
    ).toEqual({ status: 'ok', message: 'Resultado guardado. La zona terminó: los clasificados pasaron a la llave.' })
    expect(rpc).toHaveBeenNthCalledWith(1, 'record_match_result', { p_match_id: MATCH, p_sets: [[6, 3], [6, 4]] })
    expect(rpc).toHaveBeenNthCalledWith(2, 'close_championship_group', { p_group_id: 'g1', p_entry_ids: ['e1', 'e2'] })
  })

  it('closes a group in the order the organizer chose', async () => {
    const E1 = '55555555-5555-5555-5555-555555555551'
    const E2 = '55555555-5555-5555-5555-555555555552'
    await actions.closeGroup(IDLE, form({ groupId: ID, [`place:${E1}`]: '2', [`place:${E2}`]: '1' }))
    expect(rpc).toHaveBeenCalledWith('close_championship_group', { p_group_id: ID, p_entry_ids: [E2, E1] })
  })
})

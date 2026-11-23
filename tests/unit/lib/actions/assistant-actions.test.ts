import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>>(
  async () => ({ data: null, error: null }),
)
const revalidateBookings = vi.fn()

vi.mock('server-only', () => ({}))
vi.mock('@/lib/actions/revalidate', () => ({ revalidateBookings }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))

const { createStaffMatch, inviteToMatch } = await import('@/app/(club)/club/asistente/actions')
const { errorMessage } = await import('@/lib/domain/errors')
const IDLE = { status: 'idle' as const }
const COURT = 'c0000000-0000-0000-0000-000000000001'
const MATCH = 'e0000000-0000-0000-0000-000000000001'
const PLAYER = '00000000-0000-0000-0000-0000000000b1'
const VALID = {
  courtId: COURT,
  startsAt: '2026-11-24T22:00:00.000Z',
  categoryMin: '5',
  categoryMax: '6',
  matchType: 'mixed',
  allowOtherCourt: 'on',
}

function form(values: Record<string, string>): FormData {
  const data = new FormData()
  for (const [name, value] of Object.entries(values)) data.set(name, value)
  return data
}

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ data: null, error: null })
  revalidateBookings.mockClear()
})

describe('createStaffMatch', () => {
  it('creates the match with its four spots free and hands back its id', async () => {
    rpc.mockResolvedValueOnce({ data: { id: MATCH }, error: null })
    expect(await createStaffMatch(IDLE, form(VALID))).toEqual({
      status: 'ok',
      message: 'Partido creado con los 4 lugares libres. Invitá a los que suelen jugar.',
      matchId: MATCH,
    })
    expect(rpc).toHaveBeenCalledWith('staff_create_match', {
      p_court_id: COURT,
      p_starts_at: '2026-11-24T22:00:00.000Z',
      p_allow_other_court: true,
      p_category_min: 5,
      p_category_max: 6,
      p_match_type: 'mixed',
    })
    expect(revalidateBookings).toHaveBeenCalled()
  })

  it('checks the form before the database', async () => {
    expect(await createStaffMatch(IDLE, form({ ...VALID, categoryMin: '6', categoryMax: '5' }))).toEqual({
      status: 'error',
      message: 'La categoría "desde" tiene que ser menor o igual que "hasta".',
    })
    expect(await createStaffMatch(IDLE, form({ ...VALID, matchType: 'doubles' }))).toEqual({
      status: 'error',
      message: errorMessage('invalid_input'),
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('shows what the database refused', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'slot_taken' } })
    expect(await createStaffMatch(IDLE, form(VALID))).toEqual({ status: 'error', message: errorMessage('slot_taken') })
    expect(revalidateBookings).not.toHaveBeenCalled()
  })
})

describe('inviteToMatch', () => {
  it('invites and says how many', async () => {
    rpc.mockResolvedValueOnce({ data: 1, error: null })
    expect(await inviteToMatch(MATCH, [PLAYER])).toEqual({ ok: true, invited: 1 })
    expect(rpc).toHaveBeenCalledWith('invite_to_match', { p_match_id: MATCH, p_player_ids: [PLAYER] })
    expect(revalidateBookings).toHaveBeenCalled()
  })

  it('refuses ids that are not uuids, an empty list, and what the database refused', async () => {
    expect(await inviteToMatch(MATCH, ['nope'])).toEqual({ ok: false, message: errorMessage('invalid_input') })
    expect(await inviteToMatch(MATCH, [])).toEqual({ ok: false, message: errorMessage('invalid_input') })
    expect(rpc).not.toHaveBeenCalled()
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'match_closed' } })
    expect(await inviteToMatch(MATCH, [PLAYER])).toEqual({ ok: false, message: errorMessage('match_closed') })
  })
})

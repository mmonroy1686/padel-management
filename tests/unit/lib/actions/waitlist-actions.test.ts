import { beforeEach, describe, expect, it, vi } from 'vitest'
import { INVALID_INPUT } from '@/lib/actions/result'

// Server Actions are reachable by any POST: bad input must stop before any RPC.
type RpcResult = { data: unknown; error: { message: string } | null }
const rpc = vi.fn<(name: string, args?: Record<string, unknown>) => Promise<RpcResult>>(async () => ({
  data: null,
  error: null,
}))
const state = vi.hoisted(() => ({ signedIn: true }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/actions/revalidate', () => ({ revalidateBookings: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))
vi.mock('@/lib/auth/viewer', () => ({
  getViewer: async () => (state.signedIn ? { userId: 'u1', club: { id: 'club-1', timezone: 'America/Montevideo' } } : null),
}))

const { cancelSlotWait, claimSlotHold, createSlotWait, declineSlotHold, markNotificationsRead } = await import(
  '@/lib/actions/waitlist'
)
const { releaseSlotHold } = await import('@/app/(club)/club/grilla/actions')
const { errorMessage } = await import('@/lib/domain/errors')

const C1 = '22222222-2222-2222-2222-222222222201'
const C2 = '22222222-2222-2222-2222-222222222202'
const ID = '55555555-5555-5555-5555-555555555555'
const IDLE = { status: 'idle' as const }
const WAIT = { date: '2026-10-03', fromTime: '18:30', toTime: '21:30', courtIds: [C1, C2] }

function form(entries: Record<string, string | string[]>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item)
  }
  return data
}

beforeEach(() => {
  rpc.mockClear()
  state.signedIn = true
})

describe('createSlotWait', () => {
  it('rejects bad input without calling the database', async () => {
    expect(await createSlotWait(IDLE, form({ ...WAIT, date: '2026-02-30' }))).toEqual(INVALID_INPUT)
    expect(await createSlotWait(IDLE, form({ ...WAIT, fromTime: '21:30', toTime: '18:30' }))).toEqual(INVALID_INPUT)
    expect(await createSlotWait(IDLE, form({ ...WAIT, toTime: '25:00' }))).toEqual(INVALID_INPUT)
    expect(await createSlotWait(IDLE, form({ ...WAIT, courtIds: [] }))).toEqual(INVALID_INPUT)
    expect(await createSlotWait(IDLE, form({ ...WAIT, courtIds: [C1, 'cancha-2'] }))).toEqual(INVALID_INPUT)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('signs up for the club with the range and the courts picked', async () => {
    expect(await createSlotWait(IDLE, form(WAIT))).toEqual({
      status: 'ok',
      message: 'Listo, te anotamos. Si se libera un turno, te lo guardamos unos minutos y te avisamos acá y por mail.',
    })
    expect(rpc).toHaveBeenCalledWith('create_slot_wait', {
      p_club_id: 'club-1',
      p_date: '2026-10-03',
      p_from: '18:30',
      p_to: '21:30',
      p_court_ids: [C1, C2],
    })
  })

  it('says why it could not', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'slot_available' } })
    expect(await createSlotWait(IDLE, form(WAIT))).toEqual({ status: 'error', message: errorMessage('slot_available') })
  })

  it('asks to sign in again when the session ran out', async () => {
    state.signedIn = false
    expect((await createSlotWait(IDLE, form(WAIT))).status).toBe('error')
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('waits and holds', () => {
  it('rejects a bad id without calling the database', async () => {
    const bad = form({ waitId: 'w1', holdId: 'h1', occupancyId: 'o1' })
    for (const action of [cancelSlotWait, claimSlotHold, declineSlotHold, releaseSlotHold]) {
      expect(await action(IDLE, bad)).toEqual(INVALID_INPUT)
    }
    expect(rpc).not.toHaveBeenCalled()
  })

  it('calls each function with its id', async () => {
    expect((await cancelSlotWait(IDLE, form({ waitId: ID }))).message).toBe('Cancelaste la espera.')
    expect((await claimSlotHold(IDLE, form({ holdId: ID }))).message).toBe('Listo, reservaste la cancha. La ves en Tus reservas.')
    expect((await declineSlotHold(IDLE, form({ holdId: ID }))).message).toBe('Listo, se lo pasamos al siguiente de la lista.')
    expect((await releaseSlotHold(IDLE, form({ occupancyId: ID }))).message).toBe('Listo, el turno pasó al siguiente de la lista.')
    expect(rpc.mock.calls).toEqual([
      ['cancel_slot_wait', { p_wait_id: ID }],
      ['claim_slot_hold', { p_hold_id: ID }],
      ['decline_slot_hold', { p_hold_id: ID }],
      ['release_slot_hold', { p_occupancy_id: ID }],
    ])
  })

  it('tells the player when the hold ran out', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'hold_expired' } })
    expect(await claimSlotHold(IDLE, form({ holdId: ID }))).toEqual({ status: 'error', message: errorMessage('hold_expired') })
  })

  it('marks the avisos read', async () => {
    await markNotificationsRead()
    expect(rpc).toHaveBeenCalledWith('mark_notifications_read')
  })
})

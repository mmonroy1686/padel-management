import { beforeEach, describe, expect, it, vi } from 'vitest'
import { INVALID_INPUT } from '@/lib/actions/result'
import { skippedNotice } from '@/lib/domain/day-use'

// Server Actions are reachable by any POST: bad input must stop before any RPC.
type RpcResult = { data: unknown; error: { message: string } | null }
const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<RpcResult>>(async () => ({
  data: { id: 'pass-new' },
  error: null,
}))
const redirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT ${path}`)
})
const select = vi.fn<(columns: string) => Promise<{ data: { id: string }[]; error: null }>>(async () => ({
  data: [{ id: 'club-1' }],
  error: null,
}))
const eq = vi.fn<(column: string, value: string) => { select: typeof select }>(() => ({ select }))
const update = vi.fn<(values: Record<string, unknown>) => { eq: typeof eq }>(() => ({ eq }))
const from = vi.fn<(table: string) => { update: typeof update }>(() => ({ update }))

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ redirect: (path: string) => redirect(path) }))
vi.mock('@/lib/actions/revalidate', () => ({ revalidateBookings: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc, from }) }))
vi.mock('@/lib/auth/viewer', () => ({
  getViewer: async () => ({ userId: 'u1', club: { id: 'club-1', timezone: 'America/Montevideo' }, membership: { role: 'admin' } }),
}))

const player = await import('@/app/(jugador)/day-use/actions')
const club = await import('@/app/(club)/club/day-use/actions')
const { setShowInClub } = await import('@/lib/actions/profile')
const { updateLoyalty } = await import('@/app/(club)/club/ajustes/actions')
const { errorMessage } = await import('@/lib/domain/errors')

const ID = '55555555-5555-5555-5555-555555555555'
const C1 = '22222222-2222-2222-2222-222222222201'
const IDLE = { status: 'idle' as const }
const PRODUCT = {
  name: 'Day use completo',
  price: '450',
  capacity: '30',
  includes: 'Vestuarios, Pileta',
  weekdays: ['6', '0'],
  fromTime: '08:00',
  toTime: '12:30',
  courtIds: [C1],
  sortOrder: '1',
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
  from.mockClear()
  update.mockClear()
})

describe('buyDayUse', () => {
  it('rejects bad input without calling the database', async () => {
    expect(await player.buyDayUse(IDLE, form({ productId: 'p1', date: '2026-10-03', useReward: 'false' }))).toEqual(INVALID_INPUT)
    expect(await player.buyDayUse(IDLE, form({ productId: ID, date: '2026-02-30', useReward: 'false' }))).toEqual(INVALID_INPUT)
    expect(await player.buyDayUse(IDLE, form({ productId: ID, date: '2026-10-03', useReward: 'yes' }))).toEqual(INVALID_INPUT)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('buys, with the reward if asked, and opens the pass', async () => {
    await expect(player.buyDayUse(IDLE, form({ productId: ID, date: '2026-10-03', useReward: 'true' }))).rejects.toThrow(
      'NEXT_REDIRECT /day-use/pase/pass-new',
    )
    expect(rpc).toHaveBeenCalledWith('buy_day_use', { p_product_id: ID, p_date: '2026-10-03', p_use_reward: true })
  })

  it('translates what the database says', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'day_use_full' } })
    expect(await player.buyDayUse(IDLE, form({ productId: ID, date: '2026-10-03', useReward: 'false' }))).toEqual({
      status: 'error',
      message: errorMessage('day_use_full'),
    })
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe('pass actions', () => {
  it('reject ids, flags and amounts that do not have the right shape', async () => {
    const bad = form({ passId: 'p1', productId: 'p1', date: 'hoy' })
    for (const action of [
      player.cancelMyPass,
      club.checkInPass,
      club.cancelPass,
      club.recordPassCash,
      club.setProductActive,
      club.setDayUseOverride,
    ]) {
      expect(await action(IDLE, bad)).toEqual(INVALID_INPUT)
    }
    expect(await club.recordPassCash(IDLE, form({ passId: ID, amount: '0' }))).toEqual(INVALID_INPUT)
    expect(await club.setProductActive(IDLE, form({ productId: ID, active: 'maybe' }))).toEqual(INVALID_INPUT)
    expect(await club.setDayUseOverride(IDLE, form({ productId: ID, date: '2026-10-03', enabled: 'x' }))).toEqual(INVALID_INPUT)
    expect(await club.sellDayUse(IDLE, form({ productId: ID, date: '2026-10-03', holder: 'guest', guestName: '' }))).toEqual(
      INVALID_INPUT,
    )
    expect(await club.sellDayUse(IDLE, form({ productId: ID, date: '2026-10-03', holder: 'player', playerId: 'ana' }))).toEqual(
      INVALID_INPUT,
    )
    expect(await player.reportPassTransfer('p1', null)).toEqual(INVALID_INPUT)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('call each function with its arguments', async () => {
    await player.cancelMyPass(IDLE, form({ passId: ID }))
    await player.reportPassTransfer(ID, 'u1/recibo.png')
    await club.checkInPass(IDLE, form({ passId: ID }))
    await club.cancelPass(IDLE, form({ passId: ID }))
    await club.recordPassCash(IDLE, form({ passId: ID, amount: '450' }))
    await club.sellDayUse(IDLE, form({ productId: ID, date: '2026-10-03', holder: 'guest', guestName: 'Pepe', useReward: 'on' }))
    await club.sellDayUse(IDLE, form({ productId: ID, date: '2026-10-03', holder: 'player', playerId: ID, useReward: 'on' }))
    await club.setProductActive(IDLE, form({ productId: ID, active: 'false' }))
    await club.setDayUseOverride(IDLE, form({ productId: ID, date: '2026-10-03', enabled: 'true' }))
    expect(rpc.mock.calls).toEqual([
      ['cancel_day_use', { p_pass_id: ID }],
      ['report_day_use_transfer', { p_pass_id: ID, p_receipt_path: 'u1/recibo.png' }],
      ['check_in_day_use', { p_pass_id: ID }],
      ['cancel_day_use', { p_pass_id: ID }],
      ['record_day_use_cash', { p_pass_id: ID, p_amount: 450 }],
      ['sell_day_use', { p_product_id: ID, p_date: '2026-10-03', p_player_id: undefined, p_guest_name: 'Pepe', p_use_reward: false }],
      ['sell_day_use', { p_product_id: ID, p_date: '2026-10-03', p_player_id: ID, p_guest_name: undefined, p_use_reward: true }],
      ['set_day_use_product_active', { p_product_id: ID, p_active: false }],
      ['set_day_use_override', { p_product_id: ID, p_date: '2026-10-03', p_enabled: true }],
    ])
  })

  it('say what happened', async () => {
    rpc.mockResolvedValueOnce({ data: 2, error: null })
    expect(await club.setDayUseOverride(IDLE, form({ productId: ID, date: '2026-10-03', enabled: 'true' }))).toEqual({
      status: 'ok',
      message: `Ese día hay day use.${skippedNotice(2)}`,
    })
    expect(await club.checkInPass(IDLE, form({ passId: ID }))).toEqual({ status: 'ok', message: 'Ingreso registrado.' })
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'not_today' } })
    expect(await club.checkInPass(IDLE, form({ passId: ID }))).toEqual({ status: 'error', message: errorMessage('not_today') })
  })
})

describe('saveDayUseProduct', () => {
  it('explains bad input without calling the database', async () => {
    expect(await club.saveDayUseProduct(IDLE, form({ ...PRODUCT, capacity: '0' }))).toEqual({
      status: 'error',
      message: 'El cupo va de 1 a 500 personas.',
    })
    expect(await club.saveDayUseProduct(IDLE, form({ ...PRODUCT, productId: 'p1' }))).toEqual(INVALID_INPUT)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('creates a pass for the viewer club and warns about taken courts', async () => {
    rpc.mockResolvedValueOnce({ data: [{ saved_id: ID, skipped_count: 1 }], error: null })
    expect(await club.saveDayUseProduct(IDLE, form(PRODUCT))).toEqual({ status: 'ok', message: `Pase guardado.${skippedNotice(1)}` })
    expect(rpc).toHaveBeenCalledWith('save_day_use_product', {
      p_club_id: 'club-1',
      p_name: 'Day use completo',
      p_price: 450,
      p_includes: ['Vestuarios', 'Pileta'],
      p_weekdays: [0, 6],
      p_from_time: '08:00',
      p_to_time: '12:30',
      p_capacity: 30,
      p_court_ids: [C1],
      p_sort_order: 1,
      p_product_id: undefined,
    })
  })

  it('edits the pass it is given', async () => {
    await club.saveDayUseProduct(IDLE, form({ ...PRODUCT, productId: ID }))
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_product_id: ID })
  })
})

describe('profile and stamps settings', () => {
  it('saves whether the player shows in "Ya están en el club"', async () => {
    await setShowInClub(IDLE, form({}))
    expect(rpc).toHaveBeenLastCalledWith('set_show_in_club', { p_show: false })
    await setShowInClub(IDLE, form({ showInClub: 'on' }))
    expect(rpc).toHaveBeenLastCalledWith('set_show_in_club', { p_show: true })
  })

  it('saves the stamps rule on the club, and explains bad input', async () => {
    expect(
      await updateLoyalty(IDLE, form({ loyalty_every: '0', loyalty_discount_percent: '100', loyalty_expiry_months: '6' })),
    ).toEqual({ status: 'error', message: 'Los day use para la recompensa van de 1 a 50.' })
    expect(from).not.toHaveBeenCalled()
    expect(
      await updateLoyalty(
        IDLE,
        form({ loyalty_enabled: 'on', loyalty_every: '5', loyalty_discount_percent: '100', loyalty_expiry_months: 'never' }),
      ),
    ).toEqual({ status: 'ok', message: 'Sellos guardados.' })
    expect(from).toHaveBeenCalledWith('clubs')
    expect(update).toHaveBeenCalledWith({
      loyalty_enabled: true,
      loyalty_every: 5,
      loyalty_discount_percent: 100,
      loyalty_expiry_months: null,
    })
  })
})

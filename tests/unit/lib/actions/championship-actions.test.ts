import { beforeEach, describe, expect, it, vi } from 'vitest'
import { INVALID_INPUT } from '@/lib/actions/result'

// Server Actions are reachable by any POST: bad input must stop before any RPC.
type RpcResult = { data: unknown; error: { message: string } | null }
const rpc = vi.fn<(name: string, args?: Record<string, unknown>) => Promise<RpcResult>>(async () => ({
  data: { id: 'e-new', status: 'active' },
  error: null,
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/actions/revalidate', () => ({ revalidateBookings: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))

const { registerPair, reportChampionshipTransfer, saveUnavailability, withdrawEntry } = await import('@/lib/actions/championships')
const { errorMessage } = await import('@/lib/domain/errors')

const ID = '55555555-5555-5555-5555-555555555555'
const PROFILE = '66666666-6666-6666-6666-666666666666'
const IDLE = { status: 'idle' as const }

function form(entries: Record<string, string | string[]>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item)
  }
  return data
}

beforeEach(() => {
  rpc.mockClear()
})

describe('registerPair', () => {
  const MEMBER = { categoryId: ID, myLevel: '5', partnerKind: 'member', partnerProfileId: PROFILE, partnerLevel: '6' }
  const GUEST = { categoryId: ID, myLevel: '5', partnerKind: 'guest', partnerName: 'Pedro', partnerPhone: '099 123 456', partnerLevel: '6' }

  it('explains bad input without calling the database', async () => {
    expect(await registerPair(IDLE, form({ ...GUEST, partnerPhone: '12' }))).toEqual({
      status: 'error',
      message: 'Revisá el teléfono: tiene que tener entre 8 y 15 números.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('signs up with a member or with someone from outside', async () => {
    expect(await registerPair(IDLE, form(MEMBER))).toEqual({
      status: 'ok',
      message: 'Listo, quedaron anotados. Pagá la inscripción cuando quieras desde acá.',
    })
    await registerPair(IDLE, form(GUEST))
    expect(rpc.mock.calls).toEqual([
      ['register_championship_pair', { p_category_id: ID, p_my_level: 5, p_partner_level: 6, p_partner_profile_id: PROFILE }],
      ['register_championship_pair', { p_category_id: ID, p_my_level: 5, p_partner_level: 6, p_partner_name: 'Pedro', p_partner_phone: '099123456' }],
    ])
  })

  it('says when the pair waits in line', async () => {
    rpc.mockResolvedValueOnce({ data: { id: 'e-new', status: 'waiting' }, error: null })
    expect(await registerPair(IDLE, form(MEMBER))).toEqual({
      status: 'ok',
      message: 'Quedaron en la lista de espera. Si se libera un lugar, entran solos y te avisamos.',
    })
  })

  it('says why it could not', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'too_many_categories' } })
    expect(await registerPair(IDLE, form(MEMBER))).toEqual({ status: 'error', message: errorMessage('too_many_categories') })
  })
})

describe('withdrawEntry and saveUnavailability', () => {
  it('reject a bad id without calling the database', async () => {
    expect(await withdrawEntry(IDLE, form({ entryId: 'e1' }))).toEqual(INVALID_INPUT)
    expect(await saveUnavailability(IDLE, form({ entryId: ID, blocks: ['sábado'] }))).toEqual({
      status: 'error',
      message: 'Revisá los horarios marcados.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('call each function', async () => {
    expect((await withdrawEntry(IDLE, form({ entryId: ID }))).message).toBe(
      'Se dieron de baja. Si ya habían pagado, el club les devuelve la plata.',
    )
    expect((await saveUnavailability(IDLE, form({ entryId: ID, blocks: ['2026-10-17@08:00'], note: 'Trabajo' }))).message).toBe(
      'Horarios guardados.',
    )
    await saveUnavailability(IDLE, form({ entryId: ID }))
    expect(rpc.mock.calls).toEqual([
      ['withdraw_championship_entry', { p_entry_id: ID }],
      ['set_entry_unavailability', { p_entry_id: ID, p_blocks: ['2026-10-17@08:00'], p_note: 'Trabajo' }],
      ['set_entry_unavailability', { p_entry_id: ID, p_blocks: [] }],
    ])
  })
})

describe('reportChampionshipTransfer', () => {
  it('reports the transfer of the pair with its receipt', async () => {
    expect(await reportChampionshipTransfer('e1', null)).toEqual(INVALID_INPUT)
    expect(await reportChampionshipTransfer(ID, `${PROFILE}/r.png`)).toEqual({
      status: 'ok',
      message: 'Listo, le avisamos al club. Te confirma el pago cuando lo vea.',
    })
    expect(rpc).toHaveBeenCalledWith('report_championship_transfer', { p_entry_id: ID, p_receipt_path: `${PROFILE}/r.png` })
  })
})

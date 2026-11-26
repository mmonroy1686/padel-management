import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>>(
  async () => ({ data: null, error: null }),
)
const revalidateBookings = vi.fn()

vi.mock('server-only', () => ({}))
vi.mock('@/lib/actions/revalidate', () => ({ revalidateBookings }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))

const { confirmPayments, voidPayment, voidPayments } = await import('@/app/(club)/club/cobros/actions')
const IDLE = { status: 'idle' as const }
const T1 = 'a0000000-0000-0000-0000-000000000001'
const T2 = 'a0000000-0000-0000-0000-000000000002'

function form(ids: string[]): FormData {
  const data = new FormData()
  for (const id of ids) data.append('paymentId', id)
  return data
}

beforeEach(() => {
  rpc.mockClear()
  revalidateBookings.mockClear()
})

describe('confirmPayments', () => {
  it('confirms each marked transfer and says how many', async () => {
    expect(await confirmPayments(IDLE, form([T1, T2, T1]))).toEqual({ status: 'ok', message: '2 transferencias confirmadas.' })
    expect(rpc.mock.calls).toEqual([
      ['confirm_payment', { p_payment_id: T1 }],
      ['confirm_payment', { p_payment_id: T2 }],
    ])
    expect(revalidateBookings).toHaveBeenCalled()
  })

  it('keeps going when one is no longer to confirm', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'invalid_state' } })
    expect(await confirmPayments(IDLE, form([T1, T2]))).toEqual({
      status: 'ok',
      message: '1 transferencia confirmada. 1 ya no estaba por confirmar.',
    })
  })

  it('refuses bad input before the database', async () => {
    expect(await confirmPayments(IDLE, form([]))).toMatchObject({ status: 'error' })
    expect(await confirmPayments(IDLE, form(['nope']))).toMatchObject({ status: 'error' })
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('voidPayment', () => {
  it('takes a desk charge back through void_desk_payment', async () => {
    const data = new FormData()
    data.set('paymentId', T1)
    expect(await voidPayment(IDLE, data)).toEqual({ status: 'ok', message: 'Cobro anulado. Vuelve a figurar como deuda.' })
    expect(rpc).toHaveBeenCalledWith('void_desk_payment', { p_payment_id: T1 })
  })

  it('says why when it cannot', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'invalid_state' } })
    const data = new FormData()
    data.set('paymentId', T1)
    expect(await voidPayment(IDLE, data)).toMatchObject({ status: 'error' })
  })
})

describe('voidPayments', () => {
  it('takes every payment of a charge back in one call (void_desk_payments)', async () => {
    expect(await voidPayments(IDLE, form([T1, T2, T1]))).toEqual({
      status: 'ok',
      message: 'Cobros anulados (2). Vuelven a figurar como deuda.',
    })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('void_desk_payments', { p_payment_ids: [T1, T2] })
  })

  it('refuses no ids or a bad one, and says why when the database refuses', async () => {
    expect(await voidPayments(IDLE, form([]))).toMatchObject({ status: 'error' })
    expect(await voidPayments(IDLE, form(['x']))).toMatchObject({ status: 'error' })
    expect(rpc).not.toHaveBeenCalled()
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'invalid_state' } })
    expect(await voidPayments(IDLE, form([T1]))).toMatchObject({ status: 'error' })
  })
})

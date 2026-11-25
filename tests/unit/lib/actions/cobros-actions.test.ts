import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>>(
  async () => ({ data: null, error: null }),
)
const revalidateBookings = vi.fn()

vi.mock('server-only', () => ({}))
vi.mock('@/lib/actions/revalidate', () => ({ revalidateBookings }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))

const { confirmPayments } = await import('@/app/(club)/club/cobros/actions')
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

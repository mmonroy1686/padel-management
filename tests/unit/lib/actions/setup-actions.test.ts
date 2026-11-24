import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ role: 'admin' as 'player' | 'reception' | 'admin' }))
const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<{ data: null; error: { message: string } | null }>>(
  async () => ({ data: null, error: null }),
)
const redirect = vi.fn((path: string) => {
  throw new Error(`redirect:${path}`)
})

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))
vi.mock('@/lib/auth/viewer', () => ({
  getViewer: async () => ({ club: { id: 'a0000000-0000-0000-0000-000000000001' }, membership: { role: state.role } }),
}))

const { finishSetup } = await import('@/app/(club)/club/alta/actions')
const { errorMessage } = await import('@/lib/domain/errors')

beforeEach(() => {
  state.role = 'admin'
  rpc.mockClear()
})

describe('finishSetup', () => {
  it('finishes the setup and opens the panel', async () => {
    await expect(finishSetup()).rejects.toThrow('redirect:/club/inicio')
    expect(rpc).toHaveBeenCalledWith('finish_club_setup', { p_club_id: 'a0000000-0000-0000-0000-000000000001' })
  })

  it('says what is missing without a court or a price', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'setup_incomplete' } })
    expect(await finishSetup()).toEqual({ status: 'error', message: errorMessage('setup_incomplete') })
  })

  it('is for the admin only', async () => {
    state.role = 'reception'
    expect(await finishSetup()).toEqual({ status: 'error', message: errorMessage('forbidden') })
    expect(rpc).not.toHaveBeenCalled()
  })
})

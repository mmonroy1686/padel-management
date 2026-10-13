import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ role: 'admin' as 'player' | 'reception' | 'admin' }))
const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<{ data: null; error: { message: string } | null }>>(
  async () => ({ data: null, error: null }),
)
const revalidateBookings = vi.fn()

vi.mock('server-only', () => ({}))
vi.mock('@/lib/actions/revalidate', () => ({ revalidateBookings }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))
vi.mock('@/lib/auth/viewer', () => ({
  getViewer: async () => ({ club: { id: 'a0000000-0000-0000-0000-000000000001' }, membership: { role: state.role } }),
}))

const { saveClubBrand } = await import('@/app/(club)/club/ajustes/actions')
const { errorMessage } = await import('@/lib/domain/errors')
const IDLE = { status: 'idle' as const }

function form(values: Record<string, string>): FormData {
  const data = new FormData()
  for (const [name, value] of Object.entries(values)) data.set(name, value)
  return data
}

beforeEach(() => {
  state.role = 'admin'
  rpc.mockClear()
  revalidateBookings.mockClear()
})

describe('saveClubBrand', () => {
  it('saves both colors in upper case and the mode, and refreshes the app', async () => {
    const result = await saveClubBrand(IDLE, form({ primary: '#e11d48', background: '#1a1a2e', mode: 'dark' }))
    expect(result).toEqual({ status: 'ok', message: 'Marca guardada. Se ve en toda la app al recargar.' })
    expect(rpc).toHaveBeenCalledWith('save_club_brand', {
      p_club_id: 'a0000000-0000-0000-0000-000000000001',
      p_primary: '#E11D48',
      p_background: '#1A1A2E',
      p_mode: 'dark',
    })
    expect(revalidateBookings).toHaveBeenCalled()
  })

  it('explains a wrong color before the database, and lets only admins in', async () => {
    expect(await saveClubBrand(IDLE, form({ primary: 'rojo', background: '#021716', mode: 'system' }))).toEqual({
      status: 'error',
      message: 'Revisá el color principal: tiene que ser #RRGGBB, por ejemplo #FCB021.',
    })
    state.role = 'reception'
    expect(await saveClubBrand(IDLE, form({ primary: '#FCB021', background: '#021716', mode: 'system' }))).toEqual({
      status: 'error',
      message: errorMessage('forbidden'),
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('shows what the database refused', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'invalid_color' } })
    expect(await saveClubBrand(IDLE, form({ primary: '#FCB021', background: '#021716', mode: 'system' }))).toEqual({
      status: 'error',
      message: errorMessage('invalid_color'),
    })
    expect(revalidateBookings).not.toHaveBeenCalled()
  })
})

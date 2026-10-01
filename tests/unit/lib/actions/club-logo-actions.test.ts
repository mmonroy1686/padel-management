import { beforeEach, describe, expect, it, vi } from 'vitest'
import { INVALID_INPUT } from '@/lib/actions/result'

const state = vi.hoisted(() => ({ role: 'admin' as 'player' | 'reception' | 'admin' }))
const select = vi.fn(async () => ({ data: [{ id: 'a0000000-0000-0000-0000-000000000001' }], error: null }))
const eq = vi.fn(() => ({ select }))
const update = vi.fn<(row: Record<string, unknown>) => { eq: typeof eq }>(() => ({ eq }))
const from = vi.fn<(table: string) => { update: typeof update }>(() => ({ update }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/actions/revalidate', () => ({ revalidateBookings: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from }) }))
vi.mock('@/lib/auth/viewer', () => ({
  getViewer: async () => ({ club: { id: 'a0000000-0000-0000-0000-000000000001' }, membership: { role: state.role } }),
}))

const { removeClubLogo, saveClubLogo } = await import('@/app/(club)/club/ajustes/actions')
const { errorMessage } = await import('@/lib/domain/errors')
const CLUB = 'a0000000-0000-0000-0000-000000000001'

beforeEach(() => {
  state.role = 'admin'
  from.mockClear()
  update.mockClear()
})

describe('club logo actions', () => {
  it('saves a logo of the club as its logo', async () => {
    expect(await saveClubLogo(`${CLUB}/logo-1.png`)).toEqual({ status: 'ok', message: 'Logo guardado. Ya se ve en toda la app.' })
    expect(from).toHaveBeenCalledWith('clubs')
    expect(update).toHaveBeenCalledWith({ logo_path: `${CLUB}/logo-1.png` })
  })

  it('rejects a path outside the club folder and anyone but admins, before the database', async () => {
    expect(await saveClubLogo('a0000000-0000-0000-0000-000000000002/logo-1.png')).toEqual(INVALID_INPUT)
    state.role = 'reception'
    expect(await saveClubLogo(`${CLUB}/logo-1.png`)).toEqual({ status: 'error', message: errorMessage('forbidden') })
    expect(await removeClubLogo()).toEqual({ status: 'error', message: errorMessage('forbidden') })
    expect(from).not.toHaveBeenCalled()
  })

  it('removes the logo', async () => {
    expect(await removeClubLogo()).toEqual({ status: 'ok', message: 'Logo quitado.' })
    expect(update).toHaveBeenCalledWith({ logo_path: null })
  })
})

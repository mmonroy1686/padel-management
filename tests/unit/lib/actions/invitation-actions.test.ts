import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ signedIn: true }))
const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>>(
  async () => ({ data: 'reception', error: null }),
)
const signOut = vi.fn(async () => ({ error: null }))
const redirect = vi.fn((path: string) => {
  throw new Error(`redirect:${path}`)
})

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc, auth: { signOut } }) }))
vi.mock('@/lib/auth/viewer', () => ({
  getViewer: async () => (state.signedIn ? { club: { id: 'a0000000-0000-0000-0000-000000000001' } } : null),
}))

const { acceptInvitation, signInWithAnotherEmail } = await import('@/lib/actions/invitation')
const { errorMessage } = await import('@/lib/domain/errors')

beforeEach(() => {
  state.signedIn = true
  rpc.mockClear()
})

describe('acceptInvitation', () => {
  it("accepts this club's invitation and goes to the panel", async () => {
    await expect(acceptInvitation()).rejects.toThrow('redirect:/club')
    expect(rpc).toHaveBeenCalledWith('accept_staff_invitation', { p_club_id: 'a0000000-0000-0000-0000-000000000001' })
  })

  it('says why when there is no open invitation for the email', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'invitation_not_found' } })
    expect(await acceptInvitation()).toEqual({ status: 'error', message: errorMessage('invitation_not_found') })
  })

  it('asks to sign in again when the session ran out', async () => {
    state.signedIn = false
    expect(await acceptInvitation()).toEqual({
      status: 'error',
      message: 'Tu sesión venció. Volvé a entrar con el link del mail.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('signInWithAnotherEmail', () => {
  it('signs out and comes back to the invitation after signing in', async () => {
    await expect(signInWithAnotherEmail()).rejects.toThrow('redirect:/auth/ingreso?next=%2Finvitacion')
    expect(signOut).toHaveBeenCalled()
  })
})

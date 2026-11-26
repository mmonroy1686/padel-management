import { beforeEach, describe, expect, it, vi } from 'vitest'

type AuthError = { status: number; code: string } | null
const signInWithOtp = vi.fn<(args: unknown) => Promise<{ error: AuthError }>>(async () => ({ error: null as AuthError }))
const verifyOtp = vi.fn<(args: unknown) => Promise<{ error: AuthError }>>(async () => ({ error: null as AuthError }))
const roleInClub = vi.fn(async () => null as 'player' | 'reception' | 'admin' | null)
const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT ${url}`)
})

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ host: 'localhost:3000' }) }))
vi.mock('next/navigation', () => ({ redirect }))
vi.mock('@/lib/auth/role-in-club', () => ({ roleInClub }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { signInWithOtp, verifyOtp } }),
}))

const { sendMagicLink, verifySignInCode } = await import('@/app/auth/ingreso/actions')

const form = (fields: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  signInWithOtp.mockClear()
  verifyOtp.mockClear()
  redirect.mockClear()
})

describe('asking for the sign-in mail', () => {
  it('sends it and remembers the email for the code', async () => {
    const state = await sendMagicLink({ status: 'idle' }, form({ email: ' ana@club.uy ', next: '/reservar' }))
    expect(state).toEqual({ status: 'sent', email: 'ana@club.uy' })
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'ana@club.uy',
      options: { emailRedirectTo: 'http://localhost:3000/auth/callback?next=%2Freservar' },
    })
  })

  it('says when too many went out', async () => {
    signInWithOtp.mockResolvedValueOnce({ error: { status: 429, code: 'over_email_send_rate_limit' } })
    const state = await sendMagicLink({ status: 'idle' }, form({ email: 'ana@club.uy' }))
    expect(state.status).toBe('error')
    expect(state.message).toMatch(/demasiados códigos/)
  })
})

describe('signing in with the code', () => {
  it('checks the code and goes where the person was going', async () => {
    await expect(verifySignInCode({ status: 'idle' }, form({ email: 'ana@club.uy', code: '123 456', next: '/reservar' }))).rejects.toThrow(
      'NEXT_REDIRECT /reservar',
    )
    expect(verifyOtp).toHaveBeenCalledWith({ email: 'ana@club.uy', token: '123456', type: 'email' })
  })

  it('sends the staff to the panel', async () => {
    roleInClub.mockResolvedValueOnce('reception')
    await expect(verifySignInCode({ status: 'idle' }, form({ email: 'mostrador@club.uy', code: '654321', next: '/' }))).rejects.toThrow(
      'NEXT_REDIRECT /club/inicio',
    )
  })

  it('does not ask Supabase for something that is not six digits', async () => {
    const state = await verifySignInCode({ status: 'idle' }, form({ email: 'ana@club.uy', code: '12345' }))
    expect(state).toEqual({ status: 'error', message: 'Son 6 números.' })
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  it('a wrong or old code stays on the screen with the reason', async () => {
    verifyOtp.mockResolvedValueOnce({ error: { status: 403, code: 'otp_expired' } })
    const state = await verifySignInCode({ status: 'idle' }, form({ email: 'ana@club.uy', code: '000000' }))
    expect(state.status).toBe('error')
    expect(state.message).toMatch(/no es correcto o venció/)
    expect(redirect).not.toHaveBeenCalled()
  })
})

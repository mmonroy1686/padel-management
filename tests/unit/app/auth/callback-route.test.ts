import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn<(name: string) => Promise<{ data: null; error: null }>>(async () => ({ data: null, error: null }))
const exchangeCodeForSession = vi.fn(async () => ({ error: null as { code: string } | null }))
const maybeSingle = vi.fn(async () => ({ data: { role: 'player' } }))
const query = { select: () => query, eq: () => query, maybeSingle }

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { exchangeCodeForSession, getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    rpc,
    from: () => query,
  }),
}))
vi.mock('@/lib/auth/viewer', () => ({ findClub: async () => ({ id: 'club-1' }) }))

const { GET } = await import('@/app/auth/callback/route')

const request = (search: string) => new NextRequest(`http://localhost:3000/auth/callback${search}`)

beforeEach(() => {
  rpc.mockClear()
  exchangeCodeForSession.mockClear()
})

describe('the sign-in callback', () => {
  it('copies the Google photo for a player who never chose one, then goes on', async () => {
    const response = await GET(request('?code=abc&next=/'))
    expect(rpc).toHaveBeenCalledWith('sync_google_avatar')
    expect(response.headers.get('location')).toBe('http://localhost:3000/')
  })

  it('does not fail the sign-in over the photo', async () => {
    rpc.mockRejectedValueOnce(new Error('network'))
    const response = await GET(request('?code=abc&next=/reservar'))
    expect(response.headers.get('location')).toBe('http://localhost:3000/reservar')
  })

  it('without a valid code, goes back to sign-in and copies nothing', async () => {
    exchangeCodeForSession.mockResolvedValueOnce({ error: { code: 'otp_expired' } })
    const response = await GET(request('?code=old'))
    expect(rpc).not.toHaveBeenCalled()
    expect(response.headers.get('location')).toMatch(/\/auth\/ingreso\?error=/)
  })
})

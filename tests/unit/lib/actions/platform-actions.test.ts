import { beforeEach, describe, expect, it, vi } from 'vitest'

const origin = vi.hoisted(() => ({ value: 'http://localhost:3000' }))
const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>>(
  async (name) => ({ data: name === 'create_club' ? { slug: 'demo', name: 'Club Demo' } : null, error: null }),
)
const revalidateBookings = vi.fn()

vi.mock('server-only', () => ({}))
vi.mock('@/lib/actions/revalidate', () => ({ revalidateBookings }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))
vi.mock('@/lib/auth/request-origin', () => ({ requestOrigin: async () => origin.value }))

const { createClub, renameClub, resendAdminInvitation } = await import('@/app/plataforma/actions')
const { errorMessage } = await import('@/lib/domain/errors')
const IDLE = { status: 'idle' as const }

function form(values: Record<string, string>): FormData {
  const data = new FormData()
  for (const [name, value] of Object.entries(values)) data.set(name, value)
  return data
}

const NEW_CLUB = { name: 'Club Demo', slug: 'demo', timezone: 'America/Montevideo', adminEmail: 'admin@demo.uy' }

beforeEach(() => {
  origin.value = 'http://localhost:3000'
  rpc.mockClear()
  revalidateBookings.mockClear()
  vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', '')
})

describe('createClub', () => {
  it('creates the club, mails the invitation and gives its links', async () => {
    expect(await createClub(IDLE, form(NEW_CLUB))).toEqual({
      status: 'ok',
      message:
        'Listo: Club Demo está en http://demo.localhost:3000. Le mandamos la invitación a admin@demo.uy; también puede entrar en http://demo.localhost:3000/invitacion con ese email.',
    })
    expect(rpc).toHaveBeenCalledWith('create_club', {
      p_slug: 'demo',
      p_name: 'Club Demo',
      p_timezone: 'America/Montevideo',
      p_admin_email: 'admin@demo.uy',
    })
    expect(revalidateBookings).toHaveBeenCalled()
  })

  it('explains a wrong field before the database, and a taken slug from it', async () => {
    expect(await createClub(IDLE, form({ ...NEW_CLUB, slug: 'Club Demo' }))).toEqual({
      status: 'error',
      message: errorMessage('invalid_slug'),
    })
    expect(rpc).not.toHaveBeenCalled()
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'slug_taken' } })
    expect(await createClub(IDLE, form(NEW_CLUB))).toEqual({ status: 'error', message: errorMessage('slug_taken') })
    expect(revalidateBookings).not.toHaveBeenCalled()
  })
})

describe('createClub without a domain', () => {
  it('refuses while every host is the default club: the new club would have no address', async () => {
    origin.value = 'https://padel.vercel.app'
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://padel.vercel.app')
    expect(await createClub(IDLE, form(NEW_CLUB))).toEqual({
      status: 'error',
      message: 'Para crear clubes hace falta el dominio (NEXT_PUBLIC_ROOT_DOMAIN): cada club vive en su subdominio.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('renameClub', () => {
  const clubId = 'a0000000-0000-0000-0000-000000000001'

  it('moves the club to its new address', async () => {
    rpc.mockResolvedValueOnce({ data: { slug: 'norte', name: 'Club Demo' }, error: null })
    expect(await renameClub(IDLE, form({ clubId, slug: ' Norte ' }))).toEqual({
      status: 'ok',
      message: 'Listo: Club Demo ahora está en http://norte.localhost:3000.',
    })
    expect(rpc).toHaveBeenCalledWith('rename_club', { p_club_id: clubId, p_slug: 'norte' })
    expect(revalidateBookings).toHaveBeenCalled()
  })

  it('explains a malformed slug before the database, and a reserved one from it', async () => {
    expect(await renameClub(IDLE, form({ clubId, slug: 'con espacios' }))).toEqual({
      status: 'error',
      message: errorMessage('invalid_slug'),
    })
    expect(await renameClub(IDLE, form({ clubId: 'nope', slug: 'norte' }))).toEqual({
      status: 'error',
      message: errorMessage('invalid_input'),
    })
    expect(rpc).not.toHaveBeenCalled()
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'slug_reserved' } })
    expect(await renameClub(IDLE, form({ clubId, slug: 'www' }))).toEqual({ status: 'error', message: errorMessage('slug_reserved') })
    expect(revalidateBookings).not.toHaveBeenCalled()
  })
})

describe('resendAdminInvitation', () => {
  it("renews the club's admin invitation", async () => {
    const clubId = 'a0000000-0000-0000-0000-000000000001'
    expect(await resendAdminInvitation(IDLE, form({ clubId }))).toEqual({ status: 'ok', message: 'Reenviada: vence en 7 días.' })
    expect(rpc).toHaveBeenCalledWith('resend_admin_invitation', { p_club_id: clubId })
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'forbidden' } })
    expect(await resendAdminInvitation(IDLE, form({ clubId }))).toEqual({ status: 'error', message: errorMessage('forbidden') })
  })
})

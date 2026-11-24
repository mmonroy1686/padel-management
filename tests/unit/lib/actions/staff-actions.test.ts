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

const { cancelInvitation, changeStaffRole, inviteStaff, removeStaff, resendInvitation } = await import(
  '@/app/(club)/club/ajustes/staff/actions'
)
const { errorMessage } = await import('@/lib/domain/errors')
const IDLE = { status: 'idle' as const }
const CLUB = 'a0000000-0000-0000-0000-000000000001'
const USER = '00000000-0000-0000-0000-0000000000c1'
const INVITATION = 'e0000000-0000-0000-0000-000000000001'

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

describe('inviteStaff', () => {
  it('invites the email with the role and mails it once the response is out', async () => {
    expect(await inviteStaff(IDLE, form({ email: ' Carla@Club.UY ', role: 'reception' }))).toEqual({
      status: 'ok',
      message: 'Invitamos a carla@club.uy como recepción. Le llega un mail para aceptar.',
    })
    expect(rpc).toHaveBeenCalledWith('invite_staff', { p_club_id: CLUB, p_email: 'carla@club.uy', p_role: 'reception' })
    expect(revalidateBookings).toHaveBeenCalled()
  })

  it('explains a wrong email before the database, and what the database refused', async () => {
    expect(await inviteStaff(IDLE, form({ email: 'carla', role: 'reception' }))).toEqual({
      status: 'error',
      message: errorMessage('invalid_email'),
    })
    expect(rpc).not.toHaveBeenCalled()
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'already_staff' } })
    expect(await inviteStaff(IDLE, form({ email: 'carla@club.uy', role: 'admin' }))).toEqual({
      status: 'error',
      message: errorMessage('already_staff'),
    })
    expect(revalidateBookings).not.toHaveBeenCalled()
  })

  it('lets only admins manage the staff', async () => {
    state.role = 'reception'
    const forbidden = { status: 'error', message: errorMessage('forbidden') }
    expect(await inviteStaff(IDLE, form({ email: 'carla@club.uy', role: 'admin' }))).toEqual(forbidden)
    expect(await resendInvitation(IDLE, form({ invitationId: INVITATION }))).toEqual(forbidden)
    expect(await cancelInvitation(IDLE, form({ invitationId: INVITATION }))).toEqual(forbidden)
    expect(await changeStaffRole(IDLE, form({ userId: USER, role: 'admin' }))).toEqual(forbidden)
    expect(await removeStaff(IDLE, form({ userId: USER }))).toEqual(forbidden)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('invitations and roles', () => {
  it('resends and cancels an invitation', async () => {
    expect(await resendInvitation(IDLE, form({ invitationId: INVITATION }))).toEqual({
      status: 'ok',
      message: 'Reenviada: vence en 7 días.',
    })
    expect(rpc).toHaveBeenCalledWith('resend_staff_invitation', { p_id: INVITATION })
    expect(await cancelInvitation(IDLE, form({ invitationId: INVITATION }))).toEqual({
      status: 'ok',
      message: 'Invitación cancelada.',
    })
    expect(rpc).toHaveBeenCalledWith('cancel_staff_invitation', { p_id: INVITATION })
  })

  it('changes a role, only to a staff role, and says when it would leave the club without an admin', async () => {
    expect(await changeStaffRole(IDLE, form({ userId: USER, role: 'player' }))).toEqual({
      status: 'error',
      message: errorMessage('invalid_input'),
    })
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'last_admin' } })
    expect(await changeStaffRole(IDLE, form({ userId: USER, role: 'reception' }))).toEqual({
      status: 'error',
      message: errorMessage('last_admin'),
    })
    expect(rpc).toHaveBeenCalledWith('set_member_role', { p_club_id: CLUB, p_user_id: USER, p_role: 'reception' })
  })

  it('removes the access, back to player', async () => {
    expect(await removeStaff(IDLE, form({ userId: USER }))).toEqual({
      status: 'ok',
      message: 'Ya no es parte del staff. Si juega, sigue como jugador.',
    })
    expect(rpc).toHaveBeenCalledWith('remove_staff', { p_club_id: CLUB, p_user_id: USER })
  })
})

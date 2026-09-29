import { beforeEach, describe, expect, it, vi } from 'vitest'
import { INVALID_INPUT } from '@/lib/actions/result'

// Server Actions are reachable by any POST: bad input must stop before any RPC.
const rpc = vi.fn(async (..._args: unknown[]) => ({ data: null, error: null as { message: string } | null }))
const redirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT ${path}`)
})

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ redirect: (path: string) => redirect(path) }))
vi.mock('@/lib/actions/revalidate', () => ({ revalidateBookings: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))
vi.mock('@/lib/auth/viewer', () => ({
  getViewer: async () => ({ userId: 'u1', club: { id: 'club-1' }, membership: { category: 5 } }),
}))

const { bookSlot } = await import('@/app/(jugador)/reservar/actions')
const { cancelMyBooking, reportTransfer } = await import('@/app/(jugador)/reservas/actions')
const { loadSlot } = await import('@/app/(club)/club/grilla/actions')
const { saveProfile } = await import('@/lib/actions/profile')

const COURT = '22222222-2222-2222-2222-222222222201'
const BOOKING = '44444444-4444-4444-4444-444444444444'
const IDLE = { status: 'idle' as const }

function form(entries: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) data.set(key, value)
  return data
}

beforeEach(() => {
  rpc.mockClear()
  redirect.mockClear()
})

describe('bookSlot', () => {
  it('rejects a court that is not a uuid or a start without a zone', async () => {
    expect(await bookSlot(IDLE, form({ courtId: 'cancha-1', startsAt: '2026-10-01T11:00:00Z' }))).toEqual(INVALID_INPUT)
    expect(await bookSlot(IDLE, form({ courtId: COURT, startsAt: '2026-10-01T08:00' }))).toEqual(INVALID_INPUT)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('calls book_slot with the normalized instant', async () => {
    await bookSlot(IDLE, form({ courtId: COURT, startsAt: '2026-10-01T08:00:00-03:00' }))
    expect(rpc).toHaveBeenCalledWith('book_slot', { p_court_id: COURT, p_starts_at: '2026-10-01T11:00:00.000Z' })
  })

  it('translates the RPC error code', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'slot_taken' } })
    const result = await bookSlot(IDLE, form({ courtId: COURT, startsAt: '2026-10-01T11:00:00Z' }))
    expect(result).toMatchObject({ status: 'error', message: expect.stringContaining('se acaba de ocupar') })
  })
})

describe('reportTransfer and cancelMyBooking', () => {
  it('rejects anything that is not a booking id or a sane path', async () => {
    expect(await reportTransfer('b1', null)).toEqual(INVALID_INPUT)
    expect(await reportTransfer(BOOKING, 42 as unknown as string)).toEqual(INVALID_INPUT)
    expect(await reportTransfer(BOOKING, `u1/${'x'.repeat(300)}`)).toEqual(INVALID_INPUT)
    expect(await cancelMyBooking(IDLE, form({ bookingId: 'b1' }))).toEqual(INVALID_INPUT)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('passes a valid report to report_transfer', async () => {
    await reportTransfer(BOOKING, 'u1/receipt.png')
    expect(rpc).toHaveBeenCalledWith('report_transfer', { p_booking_id: BOOKING, p_receipt_path: 'u1/receipt.png' })
  })
})

describe('loadSlot', () => {
  it('needs an end time for a block and a valid holder for a booking', async () => {
    const base = { courtId: COURT, startsAt: '2026-10-01T11:00:00Z' }
    expect(await loadSlot(IDLE, form({ ...base, kind: 'block' }))).toEqual(INVALID_INPUT)
    expect(await loadSlot(IDLE, form({ ...base, kind: 'booking', holder: 'player', playerId: 'ana' }))).toEqual(INVALID_INPUT)
    expect(await loadSlot(IDLE, form({ ...base, kind: 'party', guestName: 'X' }))).toEqual(INVALID_INPUT)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('saveProfile', () => {
  const valid = { displayName: ' Lucía ', side: 'backhand', hand: 'left', category: '5', isPublic: 'on' }

  it('rejects unknown sides and categories', async () => {
    expect(await saveProfile(IDLE, form({ ...valid, side: 'center' }))).toEqual(INVALID_INPUT)
    expect(await saveProfile(IDLE, form({ ...valid, category: '9' }))).toEqual(INVALID_INPUT)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('saves everything in one RPC and only redirects inside the app', async () => {
    await expect(saveProfile(IDLE, form({ ...valid, next: '//evil.example' }))).rejects.toThrow('NEXT_REDIRECT /')
    expect(rpc).toHaveBeenCalledWith('save_my_profile', {
      p_club_id: 'club-1',
      p_display_name: 'Lucía',
      p_side: 'backhand',
      p_hand: 'left',
      p_is_public: true,
      p_category: 5,
    })
    expect(redirect).toHaveBeenCalledWith('/')
  })
})

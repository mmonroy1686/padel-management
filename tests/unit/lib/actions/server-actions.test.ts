import { beforeEach, describe, expect, it, vi } from 'vitest'
import { INVALID_INPUT } from '@/lib/actions/result'

// Server Actions are reachable by any POST: bad input must stop before any RPC.
type RpcResult = { data: unknown; error: { message: string } | null }
const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<RpcResult>>(async () => ({
  data: null,
  error: null,
}))
const redirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT ${path}`)
})

const state = vi.hoisted(() => ({
  role: 'player' as 'player' | 'reception' | 'admin',
  insertError: null as { message: string; code?: string } | null,
}))
const insert = vi.fn<(row: Record<string, unknown>) => Promise<{ error: typeof state.insertError }>>(async () => ({
  error: state.insertError,
}))
const from = vi.fn<(table: string) => { insert: typeof insert }>(() => ({ insert }))

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ redirect: (path: string) => redirect(path) }))
vi.mock('@/lib/actions/revalidate', () => ({ revalidateBookings: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc, from }) }))
vi.mock('@/lib/auth/viewer', () => ({
  getViewer: async () => ({ userId: 'u1', club: { id: 'club-1', timezone: 'America/Montevideo' }, membership: { category: 5, role: state.role } }),
}))

const { bookSlot } = await import('@/app/(jugador)/reservar/actions')
const { cancelMyBooking, reportTransfer } = await import('@/app/(jugador)/reservas/actions')
const { cancelMatch, endSeries, loadSlot, recordCash, removeFromMatch } = await import('@/app/(club)/club/grilla/actions')
const { addPricingRule, updateClubSettings } = await import('@/app/(club)/club/ajustes/actions')
const { saveAvailability, savePreferredCourts, saveProfile } = await import('@/lib/actions/profile')
const { createMatch, joinMatch, leaveMatch } = await import('@/app/(jugador)/partidos/actions')
const { errorMessage } = await import('@/lib/domain/errors')

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
  from.mockClear()
  insert.mockClear()
  state.role = 'player'
  state.insertError = null
})

describe('recurring slots', () => {
  it('rejects a series with a bad end date and an end without a valid series or date', async () => {
    const base = { courtId: COURT, startsAt: '2026-10-01T11:00:00Z', kind: 'series', date: '2026-10-01' }
    expect(
      await loadSlot(IDLE, form({ ...base, startTime: '08:00', guestName: 'Rodríguez', endsOn: 'mañana' })),
    ).toEqual(INVALID_INPUT)
    expect(await endSeries(IDLE, form({ seriesId: 's1', fromDate: '2026-10-01' }))).toEqual(INVALID_INPUT)
    expect(await endSeries(IDLE, form({ seriesId: BOOKING, fromDate: '2026-02-30' }))).toEqual(INVALID_INPUT)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('settings actions', () => {
  const band = [
    ['weekdays', '3'],
    ['from_time', '18:30'],
    ['to_time', '24:00'],
    ['price', '1600'],
  ] as const
  const bandForm = () => {
    const data = new FormData()
    for (const [key, value] of band) data.append(key, value)
    return data
  }

  it('refuses anyone who is not an admin before touching the database', async () => {
    state.role = 'reception'
    expect(await updateClubSettings(IDLE, form({ opens_at: '08:00' }))).toEqual({
      status: 'error',
      message: errorMessage('forbidden'),
    })
    expect(await addPricingRule(IDLE, bandForm())).toMatchObject({ status: 'error' })
    expect(from).not.toHaveBeenCalled()
  })

  it('explains a band that starts at the same time as another one', async () => {
    state.role = 'admin'
    state.insertError = { message: 'pricing_rule_overlap', code: '23514' }
    expect(await addPricingRule(IDLE, bandForm())).toEqual({
      status: 'error',
      message: 'Ya hay una franja que empieza a esa hora en alguno de esos días. Borrala o elegí otra hora.',
    })
    expect(insert).toHaveBeenCalledWith({ club_id: 'club-1', weekdays: [3], from_time: '18:30', to_time: '24:00', price: 1600 })
  })
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
  const valid = { displayName: ' Lucía ', side: 'backhand', hand: 'left', gender: 'female', category: '5', isPublic: 'on' }

  it('rejects unknown sides, genders and categories', async () => {
    expect(await saveProfile(IDLE, form({ ...valid, side: 'center' }))).toEqual(INVALID_INPUT)
    expect(await saveProfile(IDLE, form({ ...valid, gender: 'x' }))).toEqual(INVALID_INPUT)
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
      p_gender: 'female',
      p_is_public: true,
      p_category: 5,
    })
    expect(redirect).toHaveBeenCalledWith('/')
  })
})

describe('availability and preferred courts', () => {
  it('rejects keys and courts with the wrong shape before any RPC', async () => {
    const bad = new FormData()
    bad.append('availability', '9-night')
    expect(await saveAvailability(IDLE, bad)).toEqual(INVALID_INPUT)
    const courts = new FormData()
    courts.append('courtIds', 'cancha-1')
    expect(await savePreferredCourts(IDLE, courts)).toEqual(INVALID_INPUT)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('saves the checked keys and courts, or none', async () => {
    const data = new FormData()
    data.append('availability', '4-night')
    await saveAvailability(IDLE, data)
    expect(rpc).toHaveBeenCalledWith('save_my_availability', { p_slots: ['4-night'] })
    await savePreferredCourts(IDLE, new FormData())
    expect(rpc).toHaveBeenCalledWith('save_my_preferred_courts', { p_club_id: 'club-1', p_court_ids: [] })
  })
})

describe('match actions', () => {
  const MATCH = '55555555-5555-5555-5555-555555555555'
  const valid = {
    date: '2026-10-01',
    time: '20:00',
    courtId: COURT,
    matchType: 'mixed',
    categoryMin: '4',
    categoryMax: '6',
    side: 'backhand',
    allowOtherCourt: 'on',
  }

  it('rejects a bad match before any RPC', async () => {
    expect(await createMatch(IDLE, form({ ...valid, matchType: 'kids' }))).toEqual(INVALID_INPUT)
    expect(await createMatch(IDLE, form({ ...valid, side: 'both' }))).toEqual(INVALID_INPUT)
    expect(await createMatch(IDLE, form({ ...valid, time: '8pm' }))).toEqual(INVALID_INPUT)
    expect(await createMatch(IDLE, form({ ...valid, categoryMin: '7' }))).toEqual({
      status: 'error',
      message: 'La categoría "desde" tiene que ser menor o igual que "hasta".',
    })
    expect(await joinMatch(IDLE, form({ matchId: MATCH, position: '5' }))).toEqual(INVALID_INPUT)
    expect(await leaveMatch(IDLE, form({ matchId: 'm1' }))).toEqual(INVALID_INPUT)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('creates the match at the club time and opens it', async () => {
    rpc.mockResolvedValueOnce({ data: { id: MATCH }, error: null })
    await expect(createMatch(IDLE, form(valid))).rejects.toThrow(`NEXT_REDIRECT /partidos/${MATCH}`)
    expect(rpc).toHaveBeenCalledWith('create_match', {
      p_court_id: COURT,
      p_starts_at: '2026-10-01T23:00:00.000Z',
      p_allow_other_court: true,
      p_category_min: 4,
      p_category_max: 6,
      p_match_type: 'mixed',
      p_side: 'backhand',
    })
  })

  it('tells the player he joined, and translates the errors', async () => {
    rpc.mockResolvedValueOnce({ data: { status: 'forming', court_id: null, cancel_reason: null }, error: null })
    expect(await joinMatch(IDLE, form({ matchId: MATCH, position: '2' }))).toEqual({ status: 'ok', message: 'Te sumaste al partido.' })
    expect(rpc).toHaveBeenCalledWith('join_match', { p_match_id: MATCH, p_position: 2 })
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'side_mismatch' } })
    expect(await joinMatch(IDLE, form({ matchId: MATCH, position: '3' }))).toMatchObject({ status: 'error' })
  })
})

describe('club match actions', () => {
  const MATCH = '55555555-5555-5555-5555-555555555555'
  const PLAYER = '66666666-6666-6666-6666-666666666666'

  it('rejects bad ids and a payer that is not a uuid', async () => {
    expect(await cancelMatch(IDLE, form({ matchId: 'm1' }))).toEqual(INVALID_INPUT)
    expect(await removeFromMatch(IDLE, form({ matchId: MATCH, playerId: 'ana' }))).toEqual(INVALID_INPUT)
    expect(await recordCash(IDLE, form({ bookingId: BOOKING, amount: '400', payerId: 'ana' }))).toEqual(INVALID_INPUT)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('records cash for one player of a match', async () => {
    await recordCash(IDLE, form({ bookingId: BOOKING, amount: '400', payerId: PLAYER }))
    expect(rpc).toHaveBeenCalledWith('record_cash', { p_booking_id: BOOKING, p_amount: 400, p_payer_id: PLAYER })
    await cancelMatch(IDLE, form({ matchId: MATCH, note: ' Lluvia ' }))
    expect(rpc).toHaveBeenCalledWith('cancel_match', { p_match_id: MATCH, p_note: 'Lluvia' })
  })
})

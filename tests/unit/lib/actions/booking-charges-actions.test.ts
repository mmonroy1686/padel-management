import { beforeEach, describe, expect, it, vi } from 'vitest'
import { INVALID_INPUT } from '@/lib/actions/result'

// Server Actions are reachable by any POST: bad input must stop before any RPC.
type RpcResult = { data: unknown; error: { message: string } | null }
const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<RpcResult>>(async () => ({
  data: { amount: 300 },
  error: null,
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/actions/revalidate', () => ({ revalidateBookings: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))

const { chargeRest, chargeShare, saveBookingPlayers } = await import('@/lib/actions/booking-charges')
const { errorMessage } = await import('@/lib/domain/errors')

const BOOKING = '44444444-4444-4444-4444-444444444444'
const MEMBER = '66666666-6666-6666-6666-666666666666'
const IDLE = { status: 'idle' as const }

function form(entries: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) data.set(key, value)
  return data
}

beforeEach(() => {
  rpc.mockClear()
})

describe('chargeShare', () => {
  it('charges a player in cash or by transfer', async () => {
    expect(await chargeShare(IDLE, form({ bookingId: BOOKING, position: '2', method: 'cash' }))).toEqual({
      status: 'ok',
      message: 'Cobramos $300 en efectivo.',
    })
    expect(rpc).toHaveBeenCalledWith('charge_booking_share', { p_booking_id: BOOKING, p_position: 2, p_method: 'cash' })
    expect(await chargeShare(IDLE, form({ bookingId: BOOKING, position: '1', method: 'transfer' }))).toEqual({
      status: 'ok',
      message: 'Cobramos $300 por transferencia.',
    })
  })

  it('rejects a bad booking, position or method before the RPC', async () => {
    expect(await chargeShare(IDLE, form({ bookingId: 'b1', position: '2', method: 'cash' }))).toEqual(INVALID_INPUT)
    expect(await chargeShare(IDLE, form({ bookingId: BOOKING, position: '5', method: 'cash' }))).toEqual(INVALID_INPUT)
    expect(await chargeShare(IDLE, form({ bookingId: BOOKING, position: '2', method: 'card' }))).toEqual(INVALID_INPUT)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('tells reception when someone else charged it first', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'already_paid' } })
    expect(await chargeShare(IDLE, form({ bookingId: BOOKING, position: '2', method: 'cash' }))).toEqual({
      status: 'error',
      message: 'Ya estaba pagado.',
    })
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'method_disabled' } })
    expect(await chargeShare(IDLE, form({ bookingId: BOOKING, position: '2', method: 'cash' }))).toEqual({
      status: 'error',
      message: errorMessage('method_disabled'),
    })
  })
})

describe('chargeRest', () => {
  it('adds up what it charged', async () => {
    rpc.mockResolvedValueOnce({ data: [{ amount: 402 }, { amount: 400 }], error: null })
    expect(await chargeRest(IDLE, form({ bookingId: BOOKING, method: 'transfer' }))).toEqual({
      status: 'ok',
      message: 'Cobramos $802 por transferencia.',
    })
    expect(rpc).toHaveBeenCalledWith('charge_booking_rest', { p_booking_id: BOOKING, p_method: 'transfer' })
  })

  it('rejects a bad method before the RPC', async () => {
    expect(await chargeRest(IDLE, form({ bookingId: BOOKING }))).toEqual(INVALID_INPUT)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('saveBookingPlayers', () => {
  it('sends a member, a name and nobody', async () => {
    const result = await saveBookingPlayers(
      IDLE,
      form({ bookingId: BOOKING, player2Id: MEMBER, player2Name: '', player3Id: '', player3Name: ' Pepe ', player4Id: '', player4Name: '' }),
    )
    expect(result).toEqual({ status: 'ok', message: 'Jugadores guardados.' })
    expect(rpc).toHaveBeenCalledWith('set_booking_players', {
      p_booking_id: BOOKING,
      p_players: [
        { position: 2, player_id: MEMBER },
        { position: 3, name: 'Pepe' },
      ],
    })
  })

  it('rejects a bad member id or a name too long before the RPC', async () => {
    expect(await saveBookingPlayers(IDLE, form({ bookingId: BOOKING, player2Id: 'ana' }))).toEqual(INVALID_INPUT)
    expect(await saveBookingPlayers(IDLE, form({ bookingId: BOOKING, player3Name: 'a'.repeat(61) }))).toEqual(INVALID_INPUT)
    expect(await saveBookingPlayers(IDLE, form({ bookingId: 'b1' }))).toEqual(INVALID_INPUT)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('explains that a player who paid stays', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'already_paid' } })
    expect(await saveBookingPlayers(IDLE, form({ bookingId: BOOKING }))).toEqual({
      status: 'error',
      message: 'Ese jugador ya pagó: no se puede cambiar ni sacar.',
    })
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'player_repeated' } })
    expect(await saveBookingPlayers(IDLE, form({ bookingId: BOOKING }))).toEqual({
      status: 'error',
      message: 'Ese jugador ya está en el turno.',
    })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { INVALID_INPUT } from '@/lib/actions/result'

// Server Actions are reachable by any POST: bad input must stop before any RPC.
type RpcResult = { data: unknown; error: { message: string } | null }
const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<RpcResult>>(async () => ({
  data: { id: 'ch-new', status: 'active' },
  error: null,
}))
const redirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT ${path}`)
})

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ redirect: (path: string) => redirect(path) }))
vi.mock('@/lib/actions/revalidate', () => ({ revalidateBookings: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))
vi.mock('@/lib/auth/viewer', () => ({
  getViewer: async () => ({ userId: 'u1', club: { id: 'club-1', timezone: 'America/Montevideo' } }),
}))

const club = await import('@/app/(club)/club/torneos/campeonatos/actions')
const { errorMessage } = await import('@/lib/domain/errors')

const ID = '55555555-5555-5555-5555-555555555555'
const OTHER = '77777777-7777-7777-7777-777777777777'
const PROFILE = '66666666-6666-6666-6666-666666666666'
const C1 = '22222222-2222-2222-2222-222222222201'
const IDLE = { status: 'idle' as const }

function form(entries: Record<string, string | string[]>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item)
  }
  return data
}

beforeEach(() => {
  rpc.mockClear()
  redirect.mockClear()
})

describe('the draft', () => {
  const DETAILS = { name: 'Primavera', rules: 'Al mejor de 3 sets.', maxCategories: '2', closesDate: '', closesTime: '' }

  it('creates a championship and goes to it', async () => {
    expect(await club.createChampionship(IDLE, form({ ...DETAILS, name: '' }))).toEqual({
      status: 'error',
      message: 'Poné un nombre de hasta 80 letras.',
    })
    expect(rpc).not.toHaveBeenCalled()
    await expect(club.createChampionship(IDLE, form(DETAILS))).rejects.toThrow('NEXT_REDIRECT /club/torneos/campeonatos/ch-new')
    expect(rpc).toHaveBeenCalledWith('create_championship', {
      p_club_id: 'club-1',
      p_name: 'Primavera',
      p_rules: 'Al mejor de 3 sets.',
      p_max_categories: 2,
    })
  })

  it('edits it, with the deadline on the club clock', async () => {
    const result = await club.updateChampionship(
      IDLE,
      form({ ...DETAILS, championshipId: ID, closesDate: '2026-10-16', closesTime: '20:00' }),
    )
    expect(result).toEqual({ status: 'ok', message: 'Datos guardados.' })
    expect(rpc).toHaveBeenCalledWith('update_championship', {
      p_championship_id: ID,
      p_name: 'Primavera',
      p_rules: 'Al mejor de 3 sets.',
      p_max_categories: 2,
      p_registration_closes_at: '2026-10-16T23:00:00.000Z',
    })
  })

  it('adds and deletes days of play and categories', async () => {
    await club.addWindow(IDLE, form({ championshipId: ID, date: '2026-10-17', fromTime: '08:00', toTime: '14:00', courtIds: [C1] }))
    await club.deleteWindow(IDLE, form({ windowId: OTHER }))
    await club.addCategory(
      IDLE,
      form({
        championshipId: ID, name: '6ta Libre', gender: 'open', levelMin: '5', levelMax: '6', minPairs: '4', maxPairs: '12',
        price: '2000', format: 'groups_knockout', groupSize: '4', qualifiers: '2', matchMinutes: '90', seeding: 'ranking',
        thirdSet: 'super_tiebreak',
      }),
    )
    await club.deleteCategory(IDLE, form({ categoryId: OTHER }))
    expect(rpc.mock.calls).toEqual([
      ['add_championship_window', { p_championship_id: ID, p_date: '2026-10-17', p_from: '08:00', p_to: '14:00', p_court_ids: [C1] }],
      ['delete_championship_window', { p_window_id: OTHER }],
      [
        'add_championship_category',
        {
          p_championship_id: ID, p_name: '6ta Libre', p_gender: 'open', p_min_pairs: 4, p_max_pairs: 12, p_price: 2000,
          p_format: 'groups_knockout', p_group_size: 4, p_qualifiers: 2, p_match_minutes: 90, p_seeding: 'ranking',
          p_third_set: 'super_tiebreak', p_golden_point: false, p_level_min: 5, p_level_max: 6,
        },
      ],
      ['delete_championship_category', { p_category_id: OTHER }],
    ])
  })

  it('rejects a bad id without calling the database', async () => {
    for (const action of [club.deleteWindow, club.deleteCategory, club.openRegistration, club.closeRegistration, club.cancelChampionship]) {
      expect(await action(IDLE, form({ windowId: 'w1', categoryId: 'k1', championshipId: 'ch1' }))).toEqual(INVALID_INPUT)
    }
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('the steps', () => {
  it('opens, closes and cancels', async () => {
    expect((await club.openRegistration(IDLE, form({ championshipId: ID }))).message).toBe(
      'Inscripción abierta. Las canchas de los días de juego quedaron bloqueadas.',
    )
    expect((await club.closeRegistration(IDLE, form({ championshipId: ID }))).message).toBe(
      'Inscripción cerrada. Desde ahora solo el club carga o quita parejas.',
    )
    expect((await club.cancelChampionship(IDLE, form({ championshipId: ID }))).message).toBe(
      'Campeonato cancelado. Las canchas quedaron libres y lo cobrado está en Cobros para devolver.',
    )
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'open_championship_registration',
      'close_championship_registration',
      'cancel_championship',
    ])
  })

  it('says why it could not', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'courts_busy' } })
    expect(await club.openRegistration(IDLE, form({ championshipId: ID }))).toEqual({ status: 'error', message: errorMessage('courts_busy') })
  })
})

describe('the pairs', () => {
  it('loads a whole pair, a member and someone from outside', async () => {
    const result = await club.addPair(
      IDLE,
      form({
        categoryId: ID,
        player1Kind: 'member', player1ProfileId: PROFILE, player1Level: '5',
        player2Kind: 'guest', player2Name: 'Lucía', player2Phone: '099 111 002', player2Level: '6',
        note: '',
      }),
    )
    expect(result).toEqual({ status: 'ok', message: 'Pareja cargada.' })
    expect(rpc).toHaveBeenCalledWith('add_championship_pair', {
      p_category_id: ID,
      p_player1_level: 5,
      p_player2_level: 6,
      p_player1_profile_id: PROFILE,
      p_player2_name: 'Lucía',
      p_player2_phone: '099111002',
    })
  })

  it('says when the pair it loaded waits', async () => {
    rpc.mockResolvedValueOnce({ data: { id: 'e-new', status: 'waiting' }, error: null })
    const result = await club.addPair(
      IDLE,
      form({
        categoryId: ID,
        player1Kind: 'guest', player1Name: 'Marta', player1Phone: '099111003', player1Level: '5',
        player2Kind: 'guest', player2Name: 'Tomás', player2Phone: '099555666', player2Level: '5',
        note: 'Paga el sábado',
      }),
    )
    expect(result).toEqual({ status: 'ok', message: 'Pareja cargada en la lista de espera.' })
  })

  it('takes out, moves, charges, merges and cancels', async () => {
    await club.removePair(IDLE, form({ entryId: ID }))
    await club.movePair(IDLE, form({ entryId: ID, categoryId: OTHER }))
    await club.recordChampionshipCash(IDLE, form({ entryId: ID, amount: '2000' }))
    await club.mergeCategory(IDLE, form({ categoryId: ID, intoId: OTHER }))
    await club.cancelCategory(IDLE, form({ categoryId: ID }))
    expect(rpc.mock.calls).toEqual([
      ['remove_championship_entry', { p_entry_id: ID }],
      ['move_championship_entry', { p_entry_id: ID, p_category_id: OTHER }],
      ['record_championship_cash', { p_entry_id: ID, p_amount: 2000 }],
      ['merge_championship_category', { p_category_id: ID, p_into_id: OTHER }],
      ['cancel_championship_category', { p_category_id: ID }],
    ])
  })

  it('rejects bad input without calling the database', async () => {
    expect(await club.movePair(IDLE, form({ entryId: ID, categoryId: 'k2' }))).toEqual(INVALID_INPUT)
    expect(await club.recordChampionshipCash(IDLE, form({ entryId: ID, amount: '0' }))).toEqual(INVALID_INPUT)
    expect(await club.mergeCategory(IDLE, form({ categoryId: ID, intoId: '' }))).toEqual(INVALID_INPUT)
    expect(rpc).not.toHaveBeenCalled()
  })
})

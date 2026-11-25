import { beforeEach, describe, expect, it, vi } from 'vitest'

const CLUB = 'a0000000-0000-0000-0000-000000000001'
const PHOTO = 'f0000000-0000-0000-0000-000000000001'
const state = vi.hoisted(() => ({ role: 'admin' as 'player' | 'reception' | 'admin' }))
const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>>(
  async () => ({ data: null, error: null }),
)
const remove = vi.fn(async () => ({ data: [], error: null }))
const revalidateBookings = vi.fn()

vi.mock('server-only', () => ({}))
vi.mock('@/lib/actions/revalidate', () => ({ revalidateBookings }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc, storage: { from: () => ({ remove }) } }) }))
vi.mock('@/lib/auth/viewer', () => ({
  getViewer: async () => ({ club: { id: CLUB }, membership: { role: state.role } }),
}))

const { addClubPhoto, moveClubPhoto, removeClubPhoto, saveClubInfo } = await import('@/app/(club)/club/ajustes/datos/actions')
const { errorMessage } = await import('@/lib/domain/errors')
const IDLE = { status: 'idle' as const }

function form(values: Record<string, string | string[]>): FormData {
  const data = new FormData()
  for (const [name, value] of Object.entries(values)) for (const item of [value].flat()) data.append(name, item)
  return data
}

beforeEach(() => {
  state.role = 'admin'
  rpc.mockClear()
  remove.mockClear()
  revalidateBookings.mockClear()
})

describe('saveClubInfo', () => {
  it('saves the whole form through save_club_info and refreshes Inicio', async () => {
    const result = await saveClubInfo(
      IDLE,
      form({ address: 'Av. Italia 1234', latitude: '-34.9', longitude: '-56.1', phone: '092369558', instagram: '@rustic', amenities: ['wifi'] }),
    )
    expect(result).toEqual({ status: 'ok', message: 'Datos guardados. Ya se ven en el Inicio de los jugadores.' })
    expect(rpc).toHaveBeenCalledWith('save_club_info', {
      p_club_id: CLUB,
      p_address: 'Av. Italia 1234',
      p_latitude: -34.9,
      p_longitude: -56.1,
      p_google_maps_url: '',
      p_phone: '092369558',
      p_instagram: 'rustic',
      p_contact_email: '',
      p_amenities: ['wifi'],
    })
    expect(revalidateBookings).toHaveBeenCalled()
  })

  it('explains a wrong field before the database, and lets only admins in', async () => {
    expect(await saveClubInfo(IDLE, form({ instagram: 'a b' }))).toMatchObject({ status: 'error', message: expect.stringContaining('Instagram') })
    state.role = 'reception'
    expect(await saveClubInfo(IDLE, form({}))).toEqual({ status: 'error', message: errorMessage('forbidden') })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('shows what the database refused', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'invalid_maps_url' } })
    expect(await saveClubInfo(IDLE, form({}))).toEqual({ status: 'error', message: errorMessage('invalid_maps_url') })
    expect(revalidateBookings).not.toHaveBeenCalled()
  })
})

describe('club photos', () => {
  it('adds an uploaded photo of the club', async () => {
    expect(await addClubPhoto(`${CLUB}/photo-1.jpg`)).toEqual({ status: 'ok', message: 'Foto agregada.' })
    expect(rpc).toHaveBeenCalledWith('add_club_photo', { p_club_id: CLUB, p_path: `${CLUB}/photo-1.jpg` })
  })

  it('refuses a path outside the club folder', async () => {
    expect(await addClubPhoto('other/photo-1.jpg')).toEqual({ status: 'error', message: errorMessage('invalid_input') })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('deletes the file when the ninth photo is refused', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'too_many_photos' } })
    expect(await addClubPhoto(`${CLUB}/photo-9.jpg`)).toEqual({ status: 'error', message: errorMessage('too_many_photos') })
    expect(remove).toHaveBeenCalledWith([`${CLUB}/photo-9.jpg`])
  })

  it('keeps the file of a photo already added when a retry repeats it', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'duplicate key value', code: '23505' } })
    expect(await addClubPhoto(`${CLUB}/photo-1.jpg`)).toMatchObject({ status: 'error' })
    expect(remove).not.toHaveBeenCalled()
  })

  it('removes a photo and its file', async () => {
    rpc.mockResolvedValueOnce({ data: `${CLUB}/photo-1.jpg`, error: null })
    expect(await removeClubPhoto(PHOTO)).toEqual({ status: 'ok', message: 'Foto quitada.' })
    expect(rpc).toHaveBeenCalledWith('remove_club_photo', { p_photo_id: PHOTO })
    expect(remove).toHaveBeenCalledWith([`${CLUB}/photo-1.jpg`])
  })

  it('moves a photo one place, and nothing else', async () => {
    expect(await moveClubPhoto(PHOTO, -1)).toEqual({ status: 'ok', message: 'Orden guardado.' })
    expect(rpc).toHaveBeenCalledWith('move_club_photo', { p_photo_id: PHOTO, p_step: -1 })
    expect(await moveClubPhoto(PHOTO, 3)).toEqual({ status: 'error', message: errorMessage('invalid_input') })
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('lets only admins touch the photos', async () => {
    state.role = 'reception'
    expect(await removeClubPhoto(PHOTO)).toEqual({ status: 'error', message: errorMessage('forbidden') })
    expect(await addClubPhoto(`${CLUB}/photo-1.jpg`)).toEqual({ status: 'error', message: errorMessage('forbidden') })
    expect(rpc).not.toHaveBeenCalled()
  })
})

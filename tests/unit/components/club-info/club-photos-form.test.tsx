import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ClubPhotosForm, type ClubPhotosFormProps } from '@/components/club-info/club-photos-form'

vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }))

const ok = (message: string) => async () => ({ status: 'ok' as const, message })
const photo = (name: string) => new File(['jpg'], name, { type: 'image/jpeg' })
const PHOTOS = [
  { id: 'p1', url: 'https://x/1.jpg' },
  { id: 'p2', url: 'https://x/2.jpg' },
]

function renderForm(overrides: Partial<ClubPhotosFormProps> = {}) {
  const props: ClubPhotosFormProps = {
    clubId: 'c1',
    photos: PHOTOS,
    addAction: vi.fn(ok('Foto agregada.')),
    removeAction: vi.fn(ok('Foto quitada.')),
    moveAction: vi.fn(ok('Orden guardado.')),
    upload: vi.fn(async (_club: string, _file: File, now?: number) => ({ path: `c1/photo-${now}.jpg` })),
    ...overrides,
  }
  render(<ClubPhotosForm {...props} />)
  return props
}

describe('ClubPhotosForm', () => {
  it('uploads several photos, each added in turn', async () => {
    const props = renderForm()
    await userEvent.upload(screen.getByLabelText('Subir fotos (entran 6 más)'), [photo('a.jpg'), photo('b.jpg')])
    await userEvent.click(screen.getByRole('button', { name: 'Subir fotos' }))
    expect(await screen.findByRole('status')).toHaveTextContent('2 fotos agregadas.')
    expect(props.upload).toHaveBeenCalledTimes(2)
    expect(props.addAction).toHaveBeenCalledTimes(2)
  })

  it('stops at the first photo that fails', async () => {
    const props = renderForm({ addAction: vi.fn(async () => ({ status: 'error' as const, message: 'El club ya tiene 8 fotos.' })) })
    await userEvent.upload(screen.getByLabelText('Subir fotos (entran 6 más)'), [photo('a.jpg'), photo('b.jpg')])
    await userEvent.click(screen.getByRole('button', { name: 'Subir fotos' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('El club ya tiene 8 fotos.')
    expect(props.upload).toHaveBeenCalledTimes(1)
  })

  it('moves and removes, the first one cannot go back nor the last forward', async () => {
    const props = renderForm()
    expect(screen.getByRole('button', { name: 'Mover la foto 1 antes' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Mover la foto 2 después' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Mover la foto 2 antes' }))
    await waitFor(() => expect(props.moveAction).toHaveBeenCalledWith('p2', -1))
    await userEvent.click(screen.getByRole('button', { name: 'Quitar la foto 1' }))
    await waitFor(() => expect(props.removeAction).toHaveBeenCalledWith('p1'))
  })

  it('offers no upload with 8 photos', () => {
    renderForm({ photos: Array.from({ length: 8 }, (_, index) => ({ id: `p${index}`, url: `https://x/${index}.jpg` })) })
    expect(screen.queryByRole('button', { name: 'Subir fotos' })).toBeNull()
    expect(screen.getByText(/Ya hay 8 fotos/)).toBeInTheDocument()
  })
})

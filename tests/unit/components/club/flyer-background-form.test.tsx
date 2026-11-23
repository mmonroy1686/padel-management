import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FlyerBackgroundForm, type FlyerBackgroundFormProps } from '@/components/club/flyer-background-form'

vi.mock('@/lib/supabase/env', () => ({ getSupabaseEnv: () => ({ url: 'https://x.supabase.co', publishableKey: 'k' }) }))

const PHOTO = new File(['jpg'], 'club.jpg', { type: 'image/jpeg' })

function renderForm(overrides: Partial<FlyerBackgroundFormProps> = {}) {
  const props: FlyerBackgroundFormProps = {
    club: { id: 'c1', flyer_background_path: null },
    saveAction: vi.fn(async () => ({ status: 'ok' as const, message: 'Fondo guardado.' })),
    removeAction: vi.fn(async () => ({ status: 'ok' as const, message: 'Fondo quitado.' })),
    upload: vi.fn(async () => ({ path: 'c1/flyer-1.jpg' })),
    ...overrides,
  }
  render(<FlyerBackgroundForm {...props} />)
  return props
}

describe('FlyerBackgroundForm', () => {
  it('uploads the photo and saves it as the flyer background', async () => {
    const props = renderForm()
    await userEvent.upload(screen.getByLabelText('Foto de fondo'), PHOTO)
    await userEvent.click(screen.getByRole('button', { name: 'Guardar fondo' }))
    await waitFor(() => expect(props.saveAction).toHaveBeenCalledWith('c1/flyer-1.jpg'))
    expect(props.upload).toHaveBeenCalledWith('c1', PHOTO)
    expect(await screen.findByRole('status')).toHaveTextContent('Fondo guardado.')
  })

  it('asks for a photo first and explains one that could not be used', async () => {
    const props = renderForm({ upload: vi.fn(async () => ({ error: 'Subí una foto JPG, PNG o WebP.' })) })
    await userEvent.click(screen.getByRole('button', { name: 'Guardar fondo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Elegí la foto del fondo.')
    await userEvent.upload(screen.getByLabelText('Foto de fondo'), PHOTO)
    await userEvent.click(screen.getByRole('button', { name: 'Guardar fondo' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Subí una foto JPG, PNG o WebP.'))
    expect(props.saveAction).not.toHaveBeenCalled()
  })

  it('shows the current background and lets the admin take it out', async () => {
    const props = renderForm({ club: { id: 'c1', flyer_background_path: 'c1/flyer-1.jpg' } })
    expect(screen.getByRole('img', { name: 'Fondo actual del flyer' })).toHaveAttribute(
      'src',
      'https://x.supabase.co/storage/v1/object/public/club-logos/c1/flyer-1.jpg',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Quitar fondo' }))
    await waitFor(() => expect(props.removeAction).toHaveBeenCalled())
    expect(await screen.findByRole('status')).toHaveTextContent('Fondo quitado.')
  })
})

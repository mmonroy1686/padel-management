import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LogoForm, type LogoFormProps } from '@/components/club/logo-form'

vi.mock('@/lib/supabase/env', () => ({ getSupabaseEnv: () => ({ url: 'https://x.supabase.co', publishableKey: 'k' }) }))

const CLUB = { id: 'c1', name: 'Rustic Pádel', logo_path: null }
const PNG = new File(['png'], 'logo.png', { type: 'image/png' })

function renderForm(overrides: Partial<LogoFormProps> = {}) {
  const props: LogoFormProps = {
    club: CLUB,
    saveAction: vi.fn(async () => ({ status: 'ok' as const, message: 'Logo guardado.' })),
    removeAction: vi.fn(async () => ({ status: 'ok' as const, message: 'Logo quitado.' })),
    upload: vi.fn(async () => ({ path: 'c1/logo-1.png' })),
    ...overrides,
  }
  render(<LogoForm {...props} />)
  return props
}

describe('LogoForm', () => {
  it('uploads the file as soon as it is picked and saves it as the club logo', async () => {
    const props = renderForm()
    expect(screen.queryByRole('button', { name: 'Guardar logo' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Elegir logo' })).toBeInTheDocument()
    await userEvent.upload(screen.getByLabelText('Archivo del logo'), PNG)
    await waitFor(() => expect(props.saveAction).toHaveBeenCalledWith('c1/logo-1.png'))
    expect(props.upload).toHaveBeenCalledWith('c1', PNG)
    expect(await screen.findByRole('status')).toHaveTextContent('Logo guardado.')
  })

  it('explains an upload that failed', async () => {
    const props = renderForm({ upload: vi.fn(async () => ({ error: 'Subí una imagen PNG, JPG, WebP o SVG.' })) })
    await userEvent.upload(screen.getByLabelText('Archivo del logo'), PNG)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Subí una imagen PNG, JPG, WebP o SVG.'))
    expect(props.saveAction).not.toHaveBeenCalled()
  })

  it('offers to remove a logo only when there is one', async () => {
    renderForm()
    expect(screen.queryByRole('button', { name: 'Quitar logo' })).not.toBeInTheDocument()
    const props = renderForm({ club: { ...CLUB, logo_path: 'c1/logo-1.png' } })
    expect(screen.getByRole('button', { name: 'Cambiar logo' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Quitar logo' }))
    await waitFor(() => expect(props.removeAction).toHaveBeenCalled())
  })
})

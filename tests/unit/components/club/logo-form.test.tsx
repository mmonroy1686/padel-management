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
  it('uploads the file and saves it as the club logo', async () => {
    const props = renderForm()
    await userEvent.upload(screen.getByLabelText('Archivo del logo'), PNG)
    await userEvent.click(screen.getByRole('button', { name: 'Guardar logo' }))
    await waitFor(() => expect(props.saveAction).toHaveBeenCalledWith('c1/logo-1.png'))
    expect(props.upload).toHaveBeenCalledWith('c1', PNG)
    expect(await screen.findByRole('status')).toHaveTextContent('Logo guardado.')
  })

  it('asks for a file first and explains an upload that failed', async () => {
    const props = renderForm({ upload: vi.fn(async () => ({ error: 'Subí una imagen PNG, JPG, WebP o SVG.' })) })
    await userEvent.click(screen.getByRole('button', { name: 'Guardar logo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Elegí el archivo del logo.')
    await userEvent.upload(screen.getByLabelText('Archivo del logo'), PNG)
    await userEvent.click(screen.getByRole('button', { name: 'Guardar logo' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Subí una imagen PNG, JPG, WebP o SVG.'))
    expect(props.saveAction).not.toHaveBeenCalled()
  })

  it('offers to remove a logo only when there is one', async () => {
    renderForm()
    expect(screen.queryByRole('button', { name: 'Quitar logo' })).not.toBeInTheDocument()
    const props = renderForm({ club: { ...CLUB, logo_path: 'c1/logo-1.png' } })
    await userEvent.click(screen.getByRole('button', { name: 'Quitar logo' }))
    await waitFor(() => expect(props.removeAction).toHaveBeenCalled())
  })
})

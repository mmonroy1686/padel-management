import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BrandForm, type BrandFormProps } from '@/components/club/brand-form'

vi.mock('@/lib/supabase/env', () => ({ getSupabaseEnv: () => ({ url: 'https://x.supabase.co', publishableKey: 'k' }) }))

const RUSTIC: BrandFormProps['club'] = {
  name: 'Rustic Pádel',
  logo_path: null,
  brand_primary: '#FCB021',
  brand_background: '#021716',
  color_mode: 'system',
}

function renderForm(club: Partial<BrandFormProps['club']> = {}) {
  const action = vi.fn<BrandFormProps['action']>(async () => ({ status: 'ok', message: 'Marca guardada.' }))
  render(<BrandForm club={{ ...RUSTIC, ...club }} action={action} />)
  return action
}

const preview = (mode: 'oscuro' | 'claro') => screen.getByRole('region', { name: `Vista previa en modo ${mode}` })

describe('BrandForm', () => {
  it('previews both modes with the colors being typed, before saving', async () => {
    renderForm()
    expect(preview('oscuro').style.getPropertyValue('--accent')).toBe('#FCB021')
    expect(preview('claro').style.getPropertyValue('--accent-ink')).toBe('#8A5A00')
    const primary = screen.getByLabelText('Color principal')
    await userEvent.clear(primary)
    await userEvent.type(primary, '#1d4ed8')
    expect(preview('oscuro').style.getPropertyValue('--accent')).toBe('#1D4ED8')
    expect(preview('claro').style.getPropertyValue('--accent')).toBe('#1D4ED8')
    expect(within(preview('oscuro')).getByText('Rustic Pádel')).toBeInTheDocument()
    expect(within(preview('oscuro')).getByText('En juego')).toBeInTheDocument()
    expect(within(preview('oscuro')).getAllByText('Falta')).toHaveLength(2)
  })

  it('keeps the last full color in the preview while a #RRGGBB is half typed', async () => {
    renderForm()
    const primary = screen.getByLabelText('Color principal')
    await userEvent.clear(primary)
    await userEvent.type(primary, '#1d4')
    expect(preview('oscuro').style.getPropertyValue('--accent')).toBe('#FCB021')
  })

  it('tells what the calculation corrected, for the modes the club shows', async () => {
    renderForm()
    expect(screen.getByRole('note')).toHaveTextContent(
      'Tu color principal, como texto sobre fondo claro, se oscurece un poco para que se lea.',
    )
    await userEvent.click(screen.getByRole('radio', { name: 'Siempre oscuro' }))
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('goes back to the original colors without saving', async () => {
    const action = renderForm({ brand_primary: '#E11D48', brand_background: '#1A1A2E', color_mode: 'dark' })
    await userEvent.click(screen.getByRole('button', { name: 'Volver a los colores originales' }))
    expect(screen.getByLabelText('Color principal')).toHaveValue('#FCB021')
    expect(screen.getByLabelText('Color de fondo')).toHaveValue('#021716')
    expect(screen.getByRole('radio', { name: 'Según el dispositivo' })).toBeChecked()
    expect(action).not.toHaveBeenCalled()
  })

  it('saves the colors and the mode', async () => {
    const action = renderForm()
    await userEvent.click(screen.getByRole('radio', { name: 'Siempre claro' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar marca' }))
    await waitFor(() => expect(action).toHaveBeenCalled())
    const sent = action.mock.calls[0][1]
    expect(Object.fromEntries(sent.entries())).toEqual({ primary: '#FCB021', background: '#021716', mode: 'light' })
    expect(await screen.findByRole('status')).toHaveTextContent('Marca guardada.')
  })
})

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PosterForm, type PosterFormProps } from '@/components/championships/poster-form'

const PNG = new File(['png'], 'afiche.png', { type: 'image/png' })

function renderForm(overrides: Partial<PosterFormProps> = {}) {
  const props: PosterFormProps = {
    championshipId: 'ch1',
    clubId: 'club-1',
    posterUrl: null,
    saveAction: vi.fn(async () => ({ status: 'ok' as const, message: 'Afiche guardado.' })),
    removeAction: vi.fn(async () => ({ status: 'ok' as const, message: 'Afiche quitado.' })),
    upload: vi.fn(async () => ({ path: 'club-1/poster-1.png' })),
    ...overrides,
  }
  render(<PosterForm {...props} />)
  return props
}

describe('PosterForm', () => {
  it('uploads the file and points the championship at it', async () => {
    const props = renderForm()
    await userEvent.upload(screen.getByLabelText('Archivo del afiche'), PNG)
    await userEvent.click(screen.getByRole('button', { name: 'Guardar afiche' }))
    await waitFor(() => expect(props.saveAction).toHaveBeenCalledWith('ch1', 'club-1/poster-1.png'))
    expect(props.upload).toHaveBeenCalledWith('club-1', PNG)
    expect(await screen.findByRole('status')).toHaveTextContent('Afiche guardado.')
  })

  it('asks for a file first', async () => {
    const props = renderForm()
    await userEvent.click(screen.getByRole('button', { name: 'Guardar afiche' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Elegí el archivo del afiche.')
    expect(props.saveAction).not.toHaveBeenCalled()
  })

  it('shows the poster it has and takes it away', async () => {
    const props = renderForm({ posterUrl: 'https://db.test/poster.png' })
    expect(screen.getByRole('img', { name: 'Afiche actual' })).toHaveAttribute('src', 'https://db.test/poster.png')
    await userEvent.click(screen.getByRole('button', { name: 'Quitar afiche' }))
    await waitFor(() => expect(props.removeAction).toHaveBeenCalledWith('ch1'))
  })
})

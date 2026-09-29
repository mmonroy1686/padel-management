import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BottomSheet } from '@/components/ui/bottom-sheet'

function renderSheet(open = true) {
  const onClose = vi.fn()
  render(
    <BottomSheet open={open} onClose={onClose} title="Reservar cancha">
      <p>Contenido</p>
    </BottomSheet>,
  )
  return { onClose }
}

describe('BottomSheet', () => {
  it('renders nothing while closed', () => {
    renderSheet(false)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('is a modal dialog named by its title', () => {
    renderSheet()
    const dialog = screen.getByRole('dialog', { name: 'Reservar cancha' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('Contenido')).toBeInTheDocument()
  })

  it('always shows a visible ✕ close button and focuses it on open', () => {
    renderSheet()
    const close = screen.getByRole('button', { name: 'Cerrar' })
    expect(close).toBeVisible()
    expect(close).toHaveTextContent('✕')
    expect(close).toHaveFocus()
  })

  it('closes from the ✕ button', async () => {
    const { onClose } = renderSheet()
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes with Escape', async () => {
    const { onClose } = renderSheet()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when tapping the backdrop', async () => {
    const { onClose } = renderSheet()
    await userEvent.click(screen.getByTestId('sheet-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

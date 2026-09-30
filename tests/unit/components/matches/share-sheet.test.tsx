import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ShareSheet } from '@/components/matches/share-sheet'

describe('ShareSheet', () => {
  it('shows the message, opens WhatsApp with it and copies it', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<ShareSheet text="Falta 1" onClose={vi.fn()} />)
    expect(screen.getByLabelText('Mensaje')).toHaveValue('Falta 1')
    expect(screen.getByRole('link', { name: 'Abrir WhatsApp' })).toHaveAttribute('href', 'https://wa.me/?text=Falta%201')
    fireEvent.click(screen.getByRole('button', { name: 'Copiar mensaje' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Mensaje copiado.'))
    expect(writeText).toHaveBeenCalledWith('Falta 1')
  })
})

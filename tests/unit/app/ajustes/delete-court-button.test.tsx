import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DeleteCourtButton } from '@/app/(club)/club/ajustes/delete-court-button'
import type { FormAction } from '@/components/ui/action-form'

describe('DeleteCourtButton', () => {
  it('asks before deleting and sends the court', async () => {
    const action = vi.fn<FormAction>(async () => ({ status: 'ok', message: 'Cancha borrada.' }))
    render(<DeleteCourtButton courtId="c3" courtName="Cancha 3" action={action} />)

    await userEvent.click(screen.getByRole('button', { name: 'Borrar cancha' }))
    expect(screen.getByRole('dialog', { name: 'Borrar Cancha 3' })).toBeInTheDocument()
    expect(action).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Sí, borrar' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect(action.mock.calls[0][1].get('courtId')).toBe('c3')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('keeps the sheet open with the reason when the court has history', async () => {
    const action = vi.fn<FormAction>(async () => ({
      status: 'error',
      message: 'Esa cancha ya tiene reservas o partidos. Desactivala en lugar de borrarla.',
    }))
    render(<DeleteCourtButton courtId="c1" courtName="Cancha 1" action={action} />)
    await userEvent.click(screen.getByRole('button', { name: 'Borrar cancha' }))
    await userEvent.click(screen.getByRole('button', { name: 'Sí, borrar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Desactivala en lugar de borrarla.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

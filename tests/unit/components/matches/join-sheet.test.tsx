import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { JoinSheet } from '@/components/matches/join-sheet'
import type { FormAction } from '@/components/ui/action-form'
import { makeMatch, withPlayers } from '../../fixtures/matches'

const props = {
  whenText: 'jueves 1 de octubre, 20:00',
  paymentNote: 'Se paga en el club o por transferencia.',
  closeHours: 3,
  onClose: vi.fn(),
  onDone: vi.fn(),
}

describe('JoinSheet', () => {
  it('explains where, with whom, the price and what happens if it does not fill up', () => {
    render(<JoinSheet {...props} match={makeMatch()} position={2} action={vi.fn<FormAction>()} />)
    const sheet = screen.getByRole('dialog', { name: 'Sumarte de revés' })
    expect(sheet).toHaveTextContent('Cancha 1 (o la que quede libre)')
    expect(sheet).toHaveTextContent('Ana Pérez')
    expect(sheet).toHaveTextContent('$400 c/u')
    expect(sheet).toHaveTextContent('Si 3 h antes no se completa, se cancela solo y no pagás nada.')
  })

  it('warns the fourth player that the court gets booked, and sends the spot', async () => {
    const action = vi.fn<FormAction>(async () => ({ status: 'ok', message: 'Partido confirmado en la Cancha 1.' }))
    render(<JoinSheet {...props} match={withPlayers(makeMatch(), ['a', 'b', 'c', null])} position={4} action={action} />)
    expect(screen.getByRole('note')).toHaveTextContent('Sos el cuarto: al confirmar se reserva la cancha')
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar lugar' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect(Object.fromEntries(action.mock.calls[0][1].entries())).toEqual({ matchId: 'm1', position: '4' })
    expect(props.onDone).toHaveBeenCalledWith('Partido confirmado en la Cancha 1.')
  })
})

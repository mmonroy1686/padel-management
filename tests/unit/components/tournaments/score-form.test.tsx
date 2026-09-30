import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ScoreBoard } from '@/components/tournaments/score-board'
import { ScoreForm } from '@/components/tournaments/score-form'
import type { FormAction } from '@/components/ui/action-form'
import { TIMEZONE } from '../../fixtures/grid'
import { makeEntries, makeGame, makeTournament } from '../../fixtures/tournaments'

describe('ScoreForm', () => {
  it('fills team B with what is left and sends team A points', async () => {
    const action = vi.fn<FormAction>(async () => ({ status: 'ok' as const, message: 'Resultado guardado.' }))
    render(<ScoreForm gameId="g1" teamA="Ana y Bruno" teamB="Carla y Dani" pointsPerGame={24} scoreA={null} action={action} />)
    expect(screen.getByText('Carla y Dani: –')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Puntos de Ana y Bruno'), '15')
    expect(screen.getByText('Carla y Dani: 9')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(action).toHaveBeenCalled())
    const form = action.mock.calls[0][1]
    expect(form.get('gameId')).toBe('g1')
    expect(form.get('scoreA')).toBe('15')
    expect(await screen.findByRole('status')).toHaveTextContent('Resultado guardado.')
  })

  it('starts from the recorded result and does not guess an impossible one', async () => {
    render(<ScoreForm gameId="g1" teamA="Ana y Bruno" teamB="Carla y Dani" pointsPerGame={24} scoreA={14} action={vi.fn<FormAction>()} />)
    const input = screen.getByLabelText('Puntos de Ana y Bruno')
    expect(input).toHaveValue(14)
    expect(screen.getByText('Carla y Dani: 10')).toBeInTheDocument()
    await userEvent.clear(input)
    await userEvent.type(input, '30')
    expect(screen.getByText('Carla y Dani: –')).toBeInTheDocument()
  })
})

describe('ScoreBoard', () => {
  it('has one form per game, by round, and counts what is missing', () => {
    const tournament = makeTournament({
      status: 'in_progress',
      entries: makeEntries(8),
      games: [
        makeGame('g1', ['e1', 'e2'], ['e3', 'e4'], 14),
        makeGame('g2', ['e5', 'e6'], ['e7', 'e8'], null, { courtName: 'Cancha 2' }),
        makeGame('g3', ['e1', 'e3'], ['e5', 'e7'], null, { round: 2 }),
      ],
    })
    render(<ScoreBoard tournament={tournament} timezone={TIMEZONE} action={vi.fn<FormAction>()} />)
    expect(screen.getByText('Faltan 2 de 3.')).toBeInTheDocument()
    const first = screen.getByRole('region', { name: 'Ronda 1' })
    expect(within(first).getAllByRole('button', { name: 'Guardar' })).toHaveLength(2)
    expect(within(first).getByLabelText('Puntos de Jugador 1 y Jugador 2')).toHaveValue(14)
    expect(screen.getByRole('region', { name: 'Ronda 2' })).toBeInTheDocument()
  })
})

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

describe('ScoreForm steppers', () => {
  it('adds and takes points with + and −, within the game', async () => {
    render(<ScoreForm gameId="g1" teamA="Ana y Bruno" teamB="Carla y Dani" pointsPerGame={24} scoreA={23} action={vi.fn<FormAction>()} />)
    const input = screen.getByLabelText('Puntos de Ana y Bruno')
    await userEvent.click(screen.getByRole('button', { name: 'Sumar un punto a Ana y Bruno' }))
    await userEvent.click(screen.getByRole('button', { name: 'Sumar un punto a Ana y Bruno' }))
    expect(input).toHaveValue(24)
    await userEvent.click(screen.getByRole('button', { name: 'Restar un punto a Ana y Bruno' }))
    expect(input).toHaveValue(23)
    expect(screen.getByText('Carla y Dani: 1')).toBeInTheDocument()
  })
})

describe('ScoreBoard', () => {
  const tournament = makeTournament({
    status: 'in_progress',
    entries: makeEntries(8),
    games: [
      makeGame('g1', ['e1', 'e2'], ['e3', 'e4'], 14),
      makeGame('g2', ['e5', 'e6'], ['e7', 'e8'], 12, { courtName: 'Cancha 2' }),
      makeGame('g3', ['e1', 'e3'], ['e5', 'e7'], null, { round: 2 }),
      makeGame('g4', ['e2', 'e4'], ['e6', 'e8'], null, { round: 2, courtName: 'Cancha 2' }),
      makeGame('g5', ['e1', 'e4'], ['e5', 'e8'], null, { round: 3 }),
    ],
  })

  it('opens the round reception is on and folds the others, saying how many results each has', () => {
    render(<ScoreBoard tournament={tournament} timezone={TIMEZONE} action={vi.fn<FormAction>()} />)
    expect(screen.getByText('Faltan 3 de 5.')).toBeInTheDocument()
    const rounds = screen.getAllByRole('group')
    expect(rounds.map((round) => round.hasAttribute('open'))).toEqual([false, true, false])
    expect(rounds[0]).toHaveTextContent('Ronda 1')
    expect(rounds[0]).toHaveTextContent('2 de 2 cargados')
    expect(rounds[1]).toHaveTextContent('Ronda 2 · en curso')
    expect(within(rounds[1]).getAllByRole('button', { name: 'Guardar' })).toHaveLength(2)
  })

  it('keeps every result reachable to correct it', () => {
    render(<ScoreBoard tournament={tournament} timezone={TIMEZONE} action={vi.fn<FormAction>()} />)
    expect(screen.getByLabelText('Puntos de Jugador 1 y Jugador 2')).toHaveValue(14)
  })
})

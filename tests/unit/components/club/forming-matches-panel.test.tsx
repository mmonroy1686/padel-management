import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FormingMatchesPanel } from '@/components/club/forming-matches-panel'
import type { FormAction } from '@/components/ui/action-form'
import { makeMatch, withPlayers } from '../../fixtures/matches'

describe('FormingMatchesPanel', () => {
  it('lists what each forming match is missing and its court risk', () => {
    render(
      <FormingMatchesPanel
        items={[{ match: makeMatch(), timeText: '20:00', risk: { level: 'warn', text: 'La Cancha 1 ya se reservó.' } }]}
        actions={{ cancelMatch: vi.fn<FormAction>(), removeFromMatch: vi.fn<FormAction>() }}
      />,
    )
    expect(screen.getByText('20:00, Cancha 1')).toBeInTheDocument()
    expect(screen.getByText(/Faltan 3: 1 de drive y 2 de revés/)).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('La Cancha 1 ya se reservó.')
  })

  it('lets reception take a player out or cancel the match', async () => {
    const removeFromMatch = vi.fn<FormAction>(async () => ({ status: 'ok', message: '' }))
    render(
      <FormingMatchesPanel
        items={[{ match: withPlayers(makeMatch(), ['ana', 'bruno', null, null]), timeText: '20:00', risk: null }]}
        actions={{ cancelMatch: vi.fn<FormAction>(), removeFromMatch }}
      />,
    )
    await userEvent.click(screen.getByText('Jugadores y acciones'))
    await userEvent.click(screen.getAllByRole('button', { name: 'Sacar del partido' })[1])
    await waitFor(() => expect(removeFromMatch).toHaveBeenCalledTimes(1))
    expect(Object.fromEntries(removeFromMatch.mock.calls[0][1].entries())).toEqual({ matchId: 'm1', playerId: 'bruno' })
    expect(screen.getByRole('button', { name: 'Cancelar partido' })).toBeInTheDocument()
  })
})

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FormingMatchesPanel } from '@/components/club/forming-matches-panel'
import type { FormAction } from '@/components/ui/action-form'
import { makeMatch, withPlayers } from '../../fixtures/matches'

const actions = () => ({ cancelMatch: vi.fn<FormAction>(), removeFromMatch: vi.fn<FormAction>() })

describe('FormingMatchesPanel', () => {
  it('each match is an article titled by its time and court, with how many are in and what is missing', () => {
    render(
      <FormingMatchesPanel
        items={[{ match: withPlayers(makeMatch(), ['ana', null, null, null]), timeText: '20:00', risk: null }]}
        actions={actions()}
      />,
    )
    const card = screen.getByRole('article', { name: '20:00 · Cancha 1' })
    expect(within(card).getByRole('heading', { level: 3, name: '20:00 · Cancha 1' })).toBeInTheDocument()
    expect(within(card).getByText('1 de 4')).toBeInTheDocument()
    expect(within(card).getByText(/^Faltan 3/)).toBeInTheDocument()
    expect(within(card).getByRole('group', { name: 'Cancha con 1 de 4 jugadores' })).toBeInTheDocument()
    expect(within(card).getByText('Todavía no ocupa la cancha.')).toBeInTheDocument()
  })

  it('says the court risk as a note, in words', () => {
    render(
      <FormingMatchesPanel
        items={[{ match: makeMatch(), timeText: '20:00', risk: { level: 'warn', text: 'La Cancha 1 ya se reservó.' } }]}
        actions={actions()}
      />,
    )
    expect(screen.getByRole('note')).toHaveTextContent('La Cancha 1 ya se reservó.')
  })

  it('Gestionar partido opens the actions: take a named player out, or cancel the match', async () => {
    const removeFromMatch = vi.fn<FormAction>(async () => ({ status: 'ok', message: '' }))
    render(
      <FormingMatchesPanel
        items={[{ match: withPlayers(makeMatch(), ['ana', 'bruno', null, null]), timeText: '20:00', risk: null }]}
        actions={{ cancelMatch: vi.fn<FormAction>(), removeFromMatch }}
      />,
    )
    await userEvent.click(screen.getByText('Gestionar partido'))
    await userEvent.click(screen.getByRole('button', { name: 'Sacar a Jugador bruno' }))
    await waitFor(() => expect(removeFromMatch).toHaveBeenCalledTimes(1))
    expect(Object.fromEntries(removeFromMatch.mock.calls[0][1].entries())).toEqual({ matchId: 'm1', playerId: 'bruno' })
    expect(screen.getByRole('button', { name: 'Cancelar partido' })).toBeInTheDocument()
  })

  it('says when there is none that day', () => {
    render(<FormingMatchesPanel items={[]} actions={actions()} />)
    expect(screen.getByText('Ninguno este día.')).toBeInTheDocument()
  })
})

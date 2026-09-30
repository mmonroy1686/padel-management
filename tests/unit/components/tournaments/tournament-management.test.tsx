import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EntriesManager, type EntryActions } from '@/components/tournaments/entries-manager'
import { TournamentControls, type TournamentStepActions } from '@/components/tournaments/tournament-controls'
import type { FormAction } from '@/components/ui/action-form'
import type { TournamentEntry } from '@/lib/domain/tournaments'
import { makeEntries, makeGame, makeTournament } from '../../fixtures/tournaments'

const ok = async () => ({ status: 'ok' as const, message: 'Listo.' })
const paid = (status: 'confirmed' | 'reported') => [{ status, amount: 400, rejection_reason: null, created_at: '2026-09-30T12:00:00Z' }]
const ENTRIES: TournamentEntry[] = [
  { id: 'e1', playerId: 'p1', name: 'Ana', isGuest: false, payments: [] },
  { id: 'e2', playerId: null, name: 'Pepe', isGuest: true, payments: paid('confirmed') },
  { id: 'e3', playerId: 'p3', name: 'Bruno', isGuest: false, payments: paid('reported') },
]

function entryActions(): EntryActions {
  return { cash: vi.fn<FormAction>(ok), remove: vi.fn<FormAction>(ok), addGuest: vi.fn<FormAction>(ok) }
}

function stepActions(): TournamentStepActions {
  return {
    close: vi.fn<FormAction>(ok),
    reopen: vi.fn<FormAction>(ok),
    start: vi.fn<FormAction>(ok),
    finish: vi.fn<FormAction>(ok),
    cancel: vi.fn<FormAction>(ok),
  }
}

describe('EntriesManager', () => {
  it('shows who is in, whether each one paid, and charges cash to whoever owes', async () => {
    const actions = entryActions()
    render(<EntriesManager tournament={makeTournament({ entries: ENTRIES })} acceptsCash actions={actions} />)
    expect(screen.getByRole('heading', { name: 'Anotados (3 de 8)' })).toBeInTheDocument()
    const [ana, pepe, bruno] = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(ana).toHaveTextContent('Pendiente de pago')
    expect(pepe).toHaveTextContent('Pepe (invitado)')
    expect(pepe).toHaveTextContent('Pagada')
    expect(bruno).toHaveTextContent('Transferencia informada')
    expect(within(pepe).queryByRole('button', { name: /Cobrar/ })).not.toBeInTheDocument()
    expect(within(bruno).queryByRole('button', { name: /Cobrar/ })).not.toBeInTheDocument()
    await userEvent.click(within(ana).getByRole('button', { name: 'Cobrar $400' }))
    await waitFor(() => expect(actions.cash).toHaveBeenCalled())
    const form = vi.mocked(actions.cash).mock.calls[0][1]
    expect(form.get('entryId')).toBe('e1')
    expect(form.get('amount')).toBe('400')
  })

  it('lets reception take people out and add guests until it starts', () => {
    render(<EntriesManager tournament={makeTournament({ entries: ENTRIES, status: 'closed' })} acceptsCash actions={entryActions()} />)
    expect(screen.getAllByRole('button', { name: 'Sacar del torneo' })).toHaveLength(3)
    expect(screen.getByLabelText('Nombre del invitado')).toBeInTheDocument()
  })

  it('stops that once it is on, and asks for no guests when it is full', () => {
    const { unmount } = render(
      <EntriesManager tournament={makeTournament({ entries: ENTRIES, status: 'in_progress' })} acceptsCash actions={entryActions()} />,
    )
    expect(screen.queryByRole('button', { name: 'Sacar del torneo' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Nombre del invitado')).not.toBeInTheDocument()
    unmount()
    render(<EntriesManager tournament={makeTournament({ entries: makeEntries(8) })} acceptsCash={false} actions={entryActions()} />)
    expect(screen.queryByLabelText('Nombre del invitado')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cobrar/ })).not.toBeInTheDocument()
  })
})

describe('TournamentControls', () => {
  it('closes registration while it is open', () => {
    render(<TournamentControls tournament={makeTournament()} actions={stepActions()} />)
    expect(screen.getByRole('button', { name: 'Cerrar inscripción' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Armar fixture' })).not.toBeInTheDocument()
  })

  it('builds the fixture or reopens once closed, saying how many signed up', async () => {
    const actions = stepActions()
    render(<TournamentControls tournament={makeTournament({ status: 'closed' })} actions={actions} />)
    expect(screen.getByText('El fixture se arma con 8, 12 o 16 anotados. Hay 5.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reabrir inscripción' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Armar fixture' }))
    await waitFor(() => expect(actions.start).toHaveBeenCalled())
    expect(vi.mocked(actions.start).mock.calls[0][1].get('tournamentId')).toBe('t1')
  })

  it('finishes once it is on, saying how many results are missing', () => {
    const games = [makeGame('g1', ['e1', 'e2'], ['e3', 'e4'], 14), makeGame('g2', ['e5', 'e1'], ['e2', 'e3'], null)]
    render(<TournamentControls tournament={makeTournament({ status: 'in_progress', games })} actions={stepActions()} />)
    expect(screen.getByText('Falta cargar 1 resultado.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Finalizar torneo' })).toBeInTheDocument()
  })

  it('asks before cancelling, and not once it finished', async () => {
    const actions = stepActions()
    const { unmount } = render(<TournamentControls tournament={makeTournament()} actions={actions} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar torneo' }))
    const sheet = screen.getByRole('dialog', { name: 'Cancelar torneo' })
    expect(sheet).toHaveTextContent('Libera las canchas')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Sí, cancelar el torneo' }))
    await waitFor(() => expect(actions.cancel).toHaveBeenCalled())
    unmount()
    render(<TournamentControls tournament={makeTournament({ status: 'finished' })} actions={stepActions()} />)
    expect(screen.queryByRole('button', { name: 'Cancelar torneo' })).not.toBeInTheDocument()
  })
})

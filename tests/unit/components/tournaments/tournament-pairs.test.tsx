import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EntriesManager, type EntryActions } from '@/components/tournaments/entries-manager'
import { NewTournamentForm } from '@/components/tournaments/new-tournament-form'
import { TournamentControls, type TournamentStepActions } from '@/components/tournaments/tournament-controls'
import type { FormAction } from '@/components/ui/action-form'
import type { TournamentEntry } from '@/lib/domain/tournaments'
import { makeTournament } from '../../fixtures/tournaments'

const ok = async () => ({ status: 'ok' as const, message: 'Listo.' })
const entry = (id: string, name: string, pairId: string | null): TournamentEntry => ({
  id,
  playerId: id,
  name,
  isGuest: false,
  payments: [],
  pairId,
})
const FIXED = makeTournament({
  format: 'fixed_pairs',
  status: 'closed',
  entries: [entry('a', 'Ana', 'p1'), entry('b', 'Bruno', 'p1'), entry('c', 'Carla', null), entry('d', 'Dani', null)],
})

function entryActions(): EntryActions {
  return {
    cash: vi.fn<FormAction>(ok),
    remove: vi.fn<FormAction>(ok),
    addGuest: vi.fn<FormAction>(ok),
    pair: vi.fn<FormAction>(ok),
    split: vi.fn<FormAction>(ok),
  }
}

describe('EntriesManager with fixed pairs', () => {
  it('shows each one’s partner, and splits a pair', async () => {
    const actions = entryActions()
    render(<EntriesManager tournament={FIXED} deskMethods={['cash']} actions={actions} />)
    const ana = within(screen.getByRole('table')).getAllByRole('row')[1]
    if (!ana) throw new Error('no Ana row')
    expect(ana).toHaveTextContent('Bruno')
    await userEvent.click(within(ana).getByRole('button', { name: 'Separar a Ana y Bruno' }))
    await waitFor(() => expect(actions.split).toHaveBeenCalled())
    expect(vi.mocked(actions.split!).mock.calls[0]?.[1].get('entryId')).toBe('a')
  })

  it('pairs two who look for a partner', async () => {
    const actions = entryActions()
    render(<EntriesManager tournament={FIXED} deskMethods={['cash']} actions={actions} />)
    const carla = screen.getByLabelText('Juntar a Carla con').closest('tr')
    if (!carla) throw new Error('no Carla row')
    expect(carla).toHaveTextContent('Busca pareja')
    expect(within(carla).getByLabelText('Juntar a Carla con')).toHaveDisplayValue('Con Dani')
    await userEvent.click(within(carla).getByRole('button', { name: 'Juntar a Carla' }))
    await waitFor(() => expect(actions.pair).toHaveBeenCalled())
    const form = vi.mocked(actions.pair!).mock.calls[0]?.[1] ?? new FormData()
    expect([form.get('entryId'), form.get('partnerEntryId')]).toEqual(['c', 'd'])
  })

  it('a guest can come in as someone’s partner', () => {
    render(<EntriesManager tournament={FIXED} deskMethods={['cash']} actions={entryActions()} />)
    expect(screen.getByLabelText('Pareja de')).toHaveTextContent('Nadie todavía (busca pareja)CarlaDani')
  })
})

describe('TournamentControls with fixed pairs', () => {
  it('warns that some still look for a partner before the fixture', () => {
    const actions: TournamentStepActions = {
      close: vi.fn<FormAction>(ok),
      reopen: vi.fn<FormAction>(ok),
      start: vi.fn<FormAction>(ok),
      finish: vi.fn<FormAction>(ok),
      cancel: vi.fn<FormAction>(ok),
    }
    render(<TournamentControls tournament={FIXED} actions={actions} />)
    expect(screen.getByRole('note')).toHaveTextContent('2 anotados buscan pareja')
  })
})

describe('NewTournamentForm with fixed pairs', () => {
  it('counts pairs and proposes every pair against every other', async () => {
    render(
      <NewTournamentForm
        courts={[{ id: 'c1', name: 'Cancha 1' }, { id: 'c2', name: 'Cancha 2' }]}
        times={['18:00']}
        today="2026-12-01"
        timezone="America/Montevideo"
        opensAt="08:00"
        closesAt="23:00"
        taken={[]}
        action={vi.fn<FormAction>(ok)}
      />,
    )
    await userEvent.selectOptions(screen.getByLabelText('Formato'), 'fixed_pairs')
    expect(screen.getByLabelText('Rondas')).toHaveValue(3)
    expect(screen.getByLabelText('Jugadores')).toHaveDisplayValue('8 jugadores (4 parejas)')
    await userEvent.selectOptions(screen.getByLabelText('Jugadores'), '12')
    expect(screen.getByLabelText('Rondas')).toHaveValue(5)
  })
})

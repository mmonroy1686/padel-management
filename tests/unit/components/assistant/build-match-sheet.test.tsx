import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BuildMatchSheet } from '@/components/assistant/build-match-sheet'
import type { CreateMatchAction, InviteAction } from '@/lib/actions/result'
import { boardSlot, candidate } from '../../fixtures/assistant'
import { at, TIMEZONE } from '../../fixtures/grid'

const ROWS = [
  candidate('a', { display_name: 'Ana' }),
  candidate('b', { display_name: 'Bruno', side: 'backhand' }),
  candidate('c', { display_name: 'Carlos' }),
  candidate('d', { display_name: 'Diego', side: 'backhand' }),
  candidate('e', { display_name: 'Eva', category: 6, gender: 'female', side: 'both' }),
]
const SLOT = boardSlot('court-2', '20:00', ROWS)

function renderSheet(createAction: CreateMatchAction, inviteAction: InviteAction = vi.fn<InviteAction>()) {
  return render(
    <BuildMatchSheet
      slot={SLOT}
      timezone={TIMEZONE}
      siteUrl="https://rustic.app"
      createAction={createAction}
      inviteAction={inviteAction}
      onClose={vi.fn()}
    />,
  )
}

describe('BuildMatchSheet', () => {
  it('starts with the proposal, and changing it changes who can play', async () => {
    renderSheet(vi.fn<CreateMatchAction>())
    const sheet = screen.getByRole('dialog', { name: 'Armar partido · Cancha 2 · 20:00' })
    expect(within(sheet).getByLabelText('Desde')).toHaveValue('5')
    expect(within(sheet).getByLabelText('Hasta')).toHaveValue('5')
    expect(within(sheet).getByLabelText('Tipo')).toHaveValue('male')
    expect(within(sheet).getByRole('heading', { name: 'Pueden jugar: 4' })).toBeInTheDocument()

    await userEvent.selectOptions(within(sheet).getByLabelText('Hasta'), '6')
    await userEvent.selectOptions(within(sheet).getByLabelText('Tipo'), 'mixed')
    expect(within(sheet).getByRole('heading', { name: 'Pueden jugar: 5' })).toBeInTheDocument()
    expect(within(sheet).getByText('Eva')).toBeInTheDocument()
  })

  it('creates the match with the choice and moves on to inviting', async () => {
    const createAction = vi.fn<CreateMatchAction>(async () => ({
      status: 'ok',
      message: 'Partido creado con los 4 lugares libres. Invitá a los que suelen jugar.',
      matchId: 'm9',
    }))
    renderSheet(createAction)
    await userEvent.selectOptions(screen.getByLabelText('Hasta'), '6')
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'mixed')
    await userEvent.click(screen.getByRole('button', { name: 'Crear partido' }))

    await waitFor(() => expect(createAction).toHaveBeenCalledTimes(1))
    const sent = createAction.mock.calls[0][1]
    expect(Object.fromEntries(sent.entries())).toEqual({
      courtId: 'court-2',
      startsAt: at('20:00').toISOString(),
      categoryMin: '5',
      categoryMax: '6',
      matchType: 'mixed',
      allowOtherCourt: 'on',
    })
    expect(await screen.findByRole('heading', { name: 'Invitá a los que suelen jugar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Invitar a Eva' })).toBeInTheDocument()
  })

  it('keeps the form with the reason when the database refuses', async () => {
    renderSheet(vi.fn<CreateMatchAction>(async () => ({ status: 'error', message: 'Esa cancha se acaba de ocupar. Elegí otro horario.' })))
    await userEvent.click(screen.getByRole('button', { name: 'Crear partido' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Esa cancha se acaba de ocupar.')
    expect(screen.getByRole('button', { name: 'Crear partido' })).toBeInTheDocument()
  })

  it('warns when a side is short', () => {
    render(
      <BuildMatchSheet
        slot={boardSlot('court-1', '20:00', [candidate('x'), candidate('y'), candidate('z'), candidate('w')])}
        timezone={TIMEZONE}
        siteUrl="https://rustic.app"
        createAction={vi.fn<CreateMatchAction>()}
        inviteAction={vi.fn<InviteAction>()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('Pocos de revés')).toBeInTheDocument()
  })
})

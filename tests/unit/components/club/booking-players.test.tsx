import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BookingPlayers, type PlayersActions } from '@/components/club/booking-players'
import type { FormAction } from '@/components/ui/action-form'
import type { ActionState } from '@/lib/actions/result'
import { turnPlayers, type HomePayment, type TurnBookingRow } from '@/lib/domain/club-home'

function turnOf(overrides: Partial<TurnBookingRow> = {}) {
  return turnPlayers({
    id: 'b1',
    price: 1200,
    player_id: 'ana',
    guest_name: null,
    match_id: null,
    player: { display_name: 'Ana' },
    match: null,
    players: [{ position: 2, player_id: 'bruno', name: null, player: { display_name: 'Bruno' } }],
    payments: [],
    ...overrides,
  })
}

const ok = (message: string) => async (): Promise<ActionState> => ({ status: 'ok', message })

function renderBlock(
  turn = turnOf(),
  options: { onDone?: (message: string) => void; chargeShare?: FormAction; methods?: { cash: boolean; transfer: boolean } } = {},
) {
  const actions: PlayersActions = {
    chargeShare: options.chargeShare ?? vi.fn<FormAction>(ok('Cobramos $300 en efectivo.')),
    chargeRest: vi.fn<FormAction>(ok('Cobramos $1.200 por transferencia.')),
    savePlayers: vi.fn<FormAction>(ok('Jugadores guardados.')),
  }
  render(
    <BookingPlayers
      bookingId="b1"
      turn={turn}
      methods={options.methods ?? { cash: true, transfer: true }}
      members={[{ userId: 'gabi', name: 'Gabi Ruiz' }]}
      actions={actions}
      onDone={options.onDone}
    />,
  )
  return actions
}

describe('BookingPlayers', () => {
  it('lists the four players, unnamed ones as Jugador N, each with his share', () => {
    renderBlock()
    const rows = within(screen.getByRole('list', { name: 'Jugadores' })).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      'AnaCobrar $300',
      'BrunoCobrar $300',
      'Jugador 3Cobrar $300',
      'Jugador 4Cobrar $300',
    ])
    expect(screen.getByRole('button', { name: 'Completar jugadores' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cobrar todo lo que falta ($1.200)' })).toBeInTheDocument()
  })

  it('shows who paid and who reported a transfer', () => {
    const payments: HomePayment[] = [{ status: 'confirmed', amount: 300, payer_id: null, payer_position: 2 }]
    renderBlock(turnOf({ payments }))
    expect(screen.getByRole('list', { name: 'Jugadores' })).toHaveTextContent('BrunoPagó')
    expect(screen.getByRole('button', { name: 'Cobrar todo lo que falta ($900)' })).toBeInTheDocument()
  })

  it('charges one player and says so in the card', async () => {
    const actions = renderBlock()
    await userEvent.click(screen.getByRole('button', { name: 'Cobrar $300 a Bruno' }))
    const choice = screen.getByRole('group', { name: 'Cobrar $300 a Bruno' })
    await userEvent.click(within(choice).getByRole('button', { name: 'Efectivo' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Cobramos $300 en efectivo.')
    expect(Object.fromEntries(vi.mocked(actions.chargeShare).mock.calls[0][1].entries())).toEqual({
      bookingId: 'b1',
      position: '2',
      method: 'cash',
    })
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })

  it('keeps the error in the card when someone else charged first', async () => {
    renderBlock(turnOf(), { chargeShare: vi.fn<FormAction>(async () => ({ status: 'error', message: 'Ya estaba pagado.' })) })
    await userEvent.click(screen.getByRole('button', { name: 'Cobrar $300 a Ana' }))
    await userEvent.click(screen.getByRole('button', { name: 'Me transfirió' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya estaba pagado.')
  })

  it('charges everything left', async () => {
    const actions = renderBlock()
    await userEvent.click(screen.getByRole('button', { name: 'Cobrar todo lo que falta ($1.200)' }))
    await userEvent.click(screen.getByRole('button', { name: 'Me transfirió' }))
    await waitFor(() => expect(actions.chargeRest).toHaveBeenCalledTimes(1))
    expect(Object.fromEntries(vi.mocked(actions.chargeRest).mock.calls[0][1].entries())).toEqual({
      bookingId: 'b1',
      method: 'transfer',
    })
  })

  it('hands successes to the Grilla when it asks for them', async () => {
    const onDone = vi.fn()
    renderBlock(turnOf(), { onDone })
    await userEvent.click(screen.getByRole('button', { name: 'Cobrar $300 a Ana' }))
    await userEvent.click(screen.getByRole('button', { name: 'Efectivo' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('Cobramos $300 en efectivo.'))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('opens Completar jugadores with players 2 to 4', async () => {
    const actions = renderBlock()
    await userEvent.click(screen.getByRole('button', { name: 'Completar jugadores' }))
    const sheet = screen.getByRole('dialog', { name: 'Jugadores del turno' })
    expect(sheet).toHaveTextContent('Jugador 1: Ana, quien reservó.')
    expect(within(sheet).getByRole('combobox', { name: 'Jugador 2' })).toHaveValue('Bruno')
    await userEvent.type(within(sheet).getByRole('combobox', { name: 'Jugador 3' }), 'Pepe')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Guardar jugadores' }))
    await waitFor(() => expect(actions.savePlayers).toHaveBeenCalledTimes(1))
    expect(Object.fromEntries(vi.mocked(actions.savePlayers).mock.calls[0][1].entries())).toEqual({
      bookingId: 'b1',
      player2Id: 'bruno',
      player2Name: '',
      player3Id: '',
      player3Name: 'Pepe',
      player4Id: '',
      player4Name: '',
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Jugadores guardados.')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('leaves a player who paid as he is', async () => {
    const payments: HomePayment[] = [{ status: 'confirmed', amount: 300, payer_id: null, payer_position: 2 }]
    renderBlock(turnOf({ payments }))
    await userEvent.click(screen.getByRole('button', { name: 'Completar jugadores' }))
    const sheet = screen.getByRole('dialog', { name: 'Jugadores del turno' })
    expect(sheet).toHaveTextContent('Jugador 2: Bruno (ya pagó)')
    expect(within(sheet).queryByRole('combobox', { name: 'Jugador 2' })).not.toBeInTheDocument()
  })

  it('a match has no Completar jugadores', () => {
    renderBlock(
      turnOf({
        match_id: 'm1',
        match: { slots: [{ position: 1, player_id: 'ana', player: { display_name: 'Ana' } }] },
      }),
    )
    expect(screen.queryByRole('button', { name: /jugadores$/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cobrar $300 a Ana' })).toBeInTheDocument()
  })

  it('no charges when the club takes no method', () => {
    renderBlock(turnOf(), { methods: { cash: false, transfer: false } })
    expect(screen.queryByRole('button', { name: /^Cobrar/ })).not.toBeInTheDocument()
  })
})

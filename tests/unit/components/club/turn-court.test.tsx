import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BookingPlayers, type PlayersActions } from '@/components/club/booking-players'
import { TurnCourt } from '@/components/club/turn-court'
import type { FormAction } from '@/components/ui/action-form'
import type { ActionState } from '@/lib/actions/result'
import { turnPlayers, type TurnBookingRow } from '@/lib/domain/club-home'

function turnOf(overrides: Partial<TurnBookingRow> = {}) {
  return turnPlayers({
    id: 'b1',
    price: 1200,
    player_id: 'ana',
    guest_name: null,
    match_id: null,
    player: { display_name: 'Ana Pérez' },
    match: null,
    players: [{ position: 2, player_id: 'bruno', name: null, player: { display_name: 'Bruno' } }],
    payments: [{ status: 'confirmed', amount: 300, payer_id: null, payer_position: 2 }],
    ...overrides,
  })
}

const ok = (message: string) => async (): Promise<ActionState> => ({ status: 'ok', message })

function renderCourt(turn = turnOf()) {
  const actions: PlayersActions = {
    chargeShare: vi.fn<FormAction>(ok('Cobramos $300 en efectivo.')),
    chargeRest: vi.fn<FormAction>(ok('Cobramos $900 por transferencia.')),
    savePlayers: vi.fn<FormAction>(ok('Jugadores guardados.')),
  }
  render(
    <BookingPlayers
      bookingId="b1"
      turn={turn}
      methods={{ cash: true, transfer: true }}
      members={[]}
      actions={actions}
      layout="court"
      canAddPlayers
    />,
  )
  return actions
}

describe('TurnCourt', () => {
  it('draws four spots, each with the name and whether the player paid', () => {
    renderCourt()
    const spots = within(screen.getByRole('list', { name: 'Jugadores' })).getAllByRole('listitem')
    expect(spots.map((spot) => spot.textContent)).toEqual([
      'Ana PérezCobrar $300',
      'BrunoPagó ✓',
      'Jugador 3Cobrar $300',
      'Jugador 4Cobrar $300',
    ])
    expect(screen.getByRole('button', { name: 'Cobrar $300 a Jugador 3' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cobrar todo lo que falta ($900)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Completar jugadores' })).toBeInTheDocument()
  })

  it('opens the confirmation under the court, and charges that share', async () => {
    const actions = renderCourt()
    await userEvent.click(screen.getByRole('button', { name: 'Cobrar $300 a Ana Pérez' }))
    const choice = screen.getByRole('group', { name: 'Cobrar $300 a Ana Pérez' })
    expect(screen.getByRole('list', { name: 'Jugadores' })).not.toContainElement(choice)
    expect(screen.queryByRole('button', { name: 'Cobrar $300 a Ana Pérez' })).not.toBeInTheDocument()
    expect(within(screen.getAllByRole('listitem')[0]).getByText('Debe $300')).toBeInTheDocument()

    await userEvent.click(within(choice).getByRole('button', { name: 'Efectivo' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Cobramos $300 en efectivo.')
    expect(Object.fromEntries(vi.mocked(actions.chargeShare).mock.calls[0][1].entries())).toEqual({
      bookingId: 'b1',
      position: '1',
      method: 'cash',
    })
  })

  it('an open match leaves its empty spots free, and a reported transfer says so', () => {
    const match = turnOf({
      player_id: null,
      player: null,
      match_id: 'm1',
      players: [],
      match: {
        slots: [
          { position: 1, player_id: 'ana', player: { display_name: 'Ana' } },
          { position: 3, player_id: 'hugo', player: { display_name: 'Hugo' } },
        ],
      },
      payments: [{ status: 'reported', amount: 300, payer_id: 'hugo', payer_position: null }],
    })
    render(<TurnCourt turn={match} canCharge={false} charging={null} onCharge={() => {}} />)
    const spots = within(screen.getByRole('list', { name: 'Jugadores' })).getAllByRole('listitem')
    expect(spots.map((spot) => spot.textContent)).toEqual(['AnaDebe $300', 'Libre', 'HugoTransferencia informada', 'Libre'])
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

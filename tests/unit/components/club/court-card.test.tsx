import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CourtList } from '@/components/club/court-card'
import type { FormAction } from '@/components/ui/action-form'
import { courtItems } from '@/lib/domain/club-home'
import { at, COURTS, occupancy, TIMEZONE } from '../../fixtures/grid'

const items = courtItems({
  courts: COURTS,
  occupancies: [
    occupancy('o1', 'court-1', '11:00', '12:30'),
    occupancy('o2', 'court-2', '11:00', '14:00', 'block', 'Clase de menores'),
    { ...occupancy('o3', 'court-2', '14:00', '15:30', 'tournament', 'Copa de la Casa'), tournamentId: 't1' },
  ],
  bookings: [
    {
      id: 'b1',
      occupancy_id: 'o1',
      price: 1200,
      player_id: null,
      guest_name: 'Rodríguez',
      match_id: null,
      player: null,
      match: null,
      players: [],
      payments: [],
    },
  ],
})

function renderList(now?: Date) {
  const action = vi.fn<FormAction>(async () => ({ status: 'ok', message: 'Listo.' }))
  render(
    <CourtList
      items={items}
      timezone={TIMEZONE}
      methods={{ cash: true, transfer: true }}
      members={[]}
      actions={{ chargeShare: action, chargeRest: action, savePlayers: action }}
      now={now}
    />,
  )
}

describe('CourtList', () => {
  it('shows a booking as a card with its players and how much is left', () => {
    renderList(at('11:30'))
    const card = screen.getByRole('article', { name: 'Cancha 1, 11:00 a 12:30' })
    expect(within(card).getByRole('progressbar', { name: 'Tiempo de juego en Cancha 1' })).toHaveAttribute(
      'aria-valuenow',
      '33',
    )
    expect(card).toHaveTextContent('Faltan 60 min')
    expect(within(card).getByRole('list', { name: 'Jugadores' })).toHaveTextContent('Rodríguez')
  })

  it('shows blocks and tournaments as a line, a tournament with its link', () => {
    renderList()
    expect(screen.getByText('Cancha 2 · Clase de menores')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cancha 2 · Copa de la Casa' })).toHaveAttribute('href', '/club/torneos/t1')
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })
})

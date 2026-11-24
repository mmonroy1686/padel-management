import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PendingList } from '@/components/club/pending-list'
import type { FormAction } from '@/components/ui/action-form'
import { courtItems, type CourtTurn } from '@/lib/domain/club-home'
import { at, COURTS, occupancy, TIMEZONE } from '../../fixtures/grid'

const turns = courtItems({
  courts: COURTS,
  occupancies: [occupancy('o1', 'court-2', '08:00', '09:30')],
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
      payments: [{ status: 'confirmed', amount: 300, payer_id: null, payer_position: 1 }],
    },
  ],
}).filter((item): item is CourtTurn => item.kind === 'turn')

function renderList() {
  const action = vi.fn<FormAction>(async () => ({ status: 'ok', message: 'Listo.' }))
  render(
    <PendingList
      turns={turns}
      timezone={TIMEZONE}
      methods={{ cash: true, transfer: true, card: false }}
      members={[]}
      actions={{ chargeShare: action, chargeRest: action, savePlayers: action }}
      now={at('11:00')}
    />,
  )
}

describe('PendingList', () => {
  it('shows a compact row: court, hours, who booked and what is owed', () => {
    renderList()
    const row = screen.getByRole('listitem')
    expect(row).toHaveTextContent('Cancha 2')
    expect(row).toHaveTextContent('08:00 a 09:30')
    expect(row).toHaveTextContent('Rodríguez')
    expect(row).toHaveTextContent('Debe $900')
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('Cobrar opens the court of that booking, and Cerrar folds it', async () => {
    renderList()
    const open = screen.getByRole('button', { name: 'Cobrar Cancha 2, 08:00 a 09:30' })
    expect(open).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(open)
    const card = screen.getByRole('article', { name: 'Cancha 2, 08:00 a 09:30' })
    expect(card).toHaveTextContent('Terminó hace 1 h')
    expect(within(card).getByRole('button', { name: 'Cobrar todo lo que falta ($900)' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar Cancha 2, 08:00 a 09:30' }))
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })
})

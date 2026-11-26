import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TurnRows, TurnSearchBox, TurnSearchProvider } from '@/components/club/turn-rows'
import type { FormAction } from '@/components/ui/action-form'
import { courtItems } from '@/lib/domain/club-home'
import { at, COURTS, occupancy, TIMEZONE } from '../../fixtures/grid'

function booking(id: string, occupancyId: string, payments: { amount: number; payer_position: number }[] = []) {
  return {
    id,
    occupancy_id: occupancyId,
    price: 1200,
    player_id: null,
    guest_name: 'Rodríguez',
    match_id: null,
    player: null,
    match: null,
    players: [],
    payments: payments.map((payment) => ({ status: 'confirmed' as const, payer_id: null, ...payment })),
  }
}

const items = courtItems({
  courts: COURTS,
  occupancies: [
    occupancy('o1', 'court-1', '11:00', '12:30'),
    occupancy('o2', 'court-2', '11:00', '14:00', 'block', 'Clase de menores'),
    { ...occupancy('o3', 'court-2', '14:00', '15:30', 'tournament', 'Copa de la Casa'), tournamentId: 't1' },
    occupancy('o4', 'court-2', '16:00', '17:30'),
  ],
  bookings: [
    booking('b1', 'o1'),
    booking('b4', 'o4', [1, 2, 3, 4].map((position) => ({ amount: 300, payer_position: position }))),
  ],
})

function renderRows(now: Date) {
  const action = vi.fn<FormAction>(async () => ({ status: 'ok', message: 'Listo.' }))
  render(
    <TurnRows
      items={items}
      timezone={TIMEZONE}
      methods={{ cash: true, transfer: true, card: false }}
      members={[]}
      actions={{ chargeShare: action, chargeRest: action, savePlayers: action }}
      now={now}
    />,
  )
}

const row = (court: string) => screen.getAllByRole('listitem').find((item) => item.textContent?.includes(court))

describe('TurnRows', () => {
  it('one compact row per turn: who, court and hours, how it goes and what it owes; no court drawn', () => {
    renderRows(at('11:30'))
    expect(row('Cancha 1')).toHaveTextContent('Rodríguez')
    expect(row('Cancha 1')).toHaveTextContent('11:00 a 12:30')
    expect(row('Cancha 1')).toHaveTextContent('Faltan 60 min · Debe $1.200')
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('an upcoming turn says when it starts; one that ended, how long ago', () => {
    renderRows(at('10:15'))
    expect(row('Cancha 1')).toHaveTextContent('Empieza 11:00')
  })

  it('«Cobrar» opens the court with its charges, and «Cerrar» folds it', async () => {
    renderRows(at('12:42'))
    expect(row('Cancha 1')).toHaveTextContent('Terminó hace 12 min')
    await userEvent.click(screen.getByRole('button', { name: 'Cobrar Cancha 1, 11:00 a 12:30' }))
    const card = screen.getByRole('article', { name: 'Cancha 1, 11:00 a 12:30' })
    expect(within(card).getByRole('list', { name: 'Jugadores' })).toHaveTextContent('Rodríguez')
    expect(within(card).getByRole('button', { name: 'Cobrar $300 a Rodríguez' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Cobrar todo lo que falta ($1.200)' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar Cancha 1, 11:00 a 12:30' }))
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('a paid turn has «Ver» instead of «Cobrar», and owes nothing', async () => {
    renderRows(at('16:30'))
    expect(row('16:00 a 17:30')).not.toHaveTextContent('Debe')
    await userEvent.click(screen.getByRole('button', { name: 'Ver Cancha 2, 16:00 a 17:30' }))
    const card = screen.getByRole('article', { name: 'Cancha 2, 16:00 a 17:30' })
    expect(within(card).getAllByText('Pagó ✓')).toHaveLength(4)
  })

  it('blocks and tournaments are a quiet row with an icon, a tournament with its link', () => {
    renderRows(at('07:00'))
    const block = screen.getByText('Cancha 2 · Clase de menores').closest('li')
    expect(block?.querySelector('[data-icon="cancel"]')).not.toBeNull()
    const cup = screen.getByRole('link', { name: 'Cancha 2 · Copa de la Casa' })
    expect(cup).toHaveAttribute('href', '/club/torneos/t1')
    expect(screen.getByText('14:00 a 15:30')).toBeInTheDocument()
  })

  it('the Inicio search narrows the turns to the person at the desk', async () => {
    const action = vi.fn<FormAction>(async () => ({ status: 'ok', message: 'Listo.' }))
    render(
      <TurnSearchProvider>
        <TurnSearchBox />
        <TurnRows
          items={items}
          timezone={TIMEZONE}
          methods={{ cash: true, transfer: true, card: false }}
          members={[]}
          actions={{ chargeShare: action, chargeRest: action, savePlayers: action }}
          now={at('11:30')}
        />
      </TurnSearchProvider>,
    )
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar a quién cobrar en Inicio' }), 'rodriguez')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getAllByRole('listitem').every((item) => item.textContent?.includes('Rodríguez'))).toBe(true)
    await userEvent.clear(screen.getByRole('searchbox', { name: 'Buscar a quién cobrar en Inicio' }))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar a quién cobrar en Inicio' }), 'zzz')
    expect(screen.getByText('Nadie coincide acá.')).toBeInTheDocument()
  })
})

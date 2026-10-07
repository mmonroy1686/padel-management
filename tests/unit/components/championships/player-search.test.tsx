import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PlayerSearch } from '@/components/championships/player-search'
import type { FormAction } from '@/components/ui/action-form'
import type { PairCard } from '@/lib/domain/championship-search'
import { makeView, makeZone } from '../../fixtures/championship-views'

const ok = async () => ({ status: 'ok' as const, message: 'Listo.' })

// Ana Pérez and Pedro Viera in 6ta Libre: Zona A played, the semifinal next.
function makeCard(overrides: Partial<PairCard> = {}): PairCard {
  return {
    entryId: 'e1',
    categoryId: 'k1',
    categoryName: '6ta Libre',
    pair: 'Ana Pérez y Pedro Viera',
    label: 'Ana Pérez y Pedro Viera · 6ta Libre',
    situation: 'En la llave · Semifinal 1',
    live: [],
    upcoming: [makeView({ id: 's1', name: 'Semifinal 1', stage: 'knockout', groupId: null, sideA: 'Ana Pérez y Pedro Viera', time: '14:00' })],
    played: [
      makeView({
        sideA: 'Ana Pérez y Pedro Viera',
        status: 'finished',
        statusLabel: 'Terminado',
        winner: 'a',
        score: '6-3 6-3',
        sets: [
          { a: 6, b: 3, superTiebreak: false, inProgress: false },
          { a: 6, b: 3, superTiebreak: false, inProgress: false },
        ],
      }),
    ],
    zone: makeZone({
      rows: [
        { entryId: 'e1', name: 'Ana Pérez y Pedro Viera', played: 1, won: 1, lost: 0, sets: '2-0', games: '12-6' },
        { entryId: 'e2', name: 'Bruno y Lucía', played: 1, won: 0, lost: 1, sets: '0-2', games: '6-12' },
      ],
    }),
    bracket: { match: 'Semifinal 1', rival: 'Bruno y Lucía', next: 'Si gana: Final contra Ganador SF2' },
    private: null,
    ...overrides,
  }
}
const BRUNO_CARD = makeCard({ entryId: 'e2', pair: 'Bruno y Lucía', label: 'Bruno y Lucía · 6ta Libre' })

describe('PlayerSearch', () => {
  it('finds a pair while typing and opens its card', async () => {
    render(<PlayerSearch pairs={[makeCard(), BRUNO_CARD]} />)
    await userEvent.type(screen.getByLabelText('Buscar jugador'), 'perez')
    expect(screen.queryByRole('button', { name: 'Bruno y Lucía · 6ta Libre' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ana Pérez y Pedro Viera · 6ta Libre' }))
    const card = screen.getByRole('dialog', { name: 'Ana Pérez y Pedro Viera' })
    expect(card).toHaveTextContent('En la llave · Semifinal 1')
    expect(card).toHaveTextContent('Semifinal 1 contra Bruno y Lucía')
    expect(card).toHaveTextContent('Si gana: Final contra Ganador SF2')
    expect(within(card).getByRole('region', { name: 'Próximos' })).toHaveTextContent('14:00')
    expect(within(card).getByRole('region', { name: 'Jugados' })).toBeInTheDocument()
    expect(within(card).getByRole('row', { current: true })).toHaveTextContent('Ana Pérez y Pedro Viera')
    expect(within(card).queryByRole('region', { name: 'Datos del club' })).not.toBeInTheDocument()
  })

  it('says when nobody matches', async () => {
    render(<PlayerSearch pairs={[makeCard()]} />)
    await userEvent.type(screen.getByLabelText('Buscar jugador'), 'zzz')
    expect(screen.getByText('No encontramos a nadie con ese nombre.')).toBeInTheDocument()
  })

  it('shows the club the payment, the hours and the phones, and charges', async () => {
    const cash = vi.fn<FormAction>(ok)
    render(
      <PlayerSearch
        pairs={[
          makeCard({
            private: { phones: '099111001', paymentState: 'pending', charge: 2000, hoursText: 'No pueden en 1 franja.' },
          }),
        ]}
        cash={{ action: cash, acceptsCash: true }}
      />,
    )
    await userEvent.type(screen.getByLabelText('Buscar jugador'), 'ana')
    await userEvent.click(screen.getByRole('button', { name: 'Ana Pérez y Pedro Viera · 6ta Libre' }))
    const club = within(screen.getByRole('dialog')).getByRole('region', { name: 'Datos del club' })
    expect(club).toHaveTextContent('Teléfonos: 099111001')
    expect(club).toHaveTextContent('No pueden en 1 franja.')
    await userEvent.click(within(club).getByRole('button', { name: 'Cobrar $2.000' }))
    await waitFor(() => expect(cash).toHaveBeenCalled())
    const form = cash.mock.calls[0][1]
    expect([form.get('entryId'), form.get('amount')]).toEqual(['e1', '2000'])
  })
})

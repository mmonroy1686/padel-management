import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MoneyTable, type MoneyItem } from '@/app/(club)/club/cobros/money-table'
import type { FormAction } from '@/components/ui/action-form'

const done = vi.fn<FormAction>(async () => ({ status: 'ok', message: 'Listo.' }))

const ITEMS: MoneyItem[] = [
  { id: 'b1', kind: 'booking', holder: 'Ana López', what: 'Cancha 1', when: 'jueves 1 de octubre, 20:00', at: 2, amount: 1600,
    action: { label: 'Cobrar en efectivo', fields: { bookingId: 'b1', amount: '1600' } } },
  { id: 'e1', kind: 'tournament', holder: 'Bruno Silva', what: 'Torneo Americano', when: 'viernes 2 de octubre, 18:00', at: 3, amount: 400,
    action: { label: 'Cobrar en efectivo', fields: { entryId: 'e1', amount: '400' } } },
  { id: 'p1', kind: 'day_use', holder: 'Carla Ruiz', what: 'Day use pádel', when: 'sábado 3 de octubre, 14:00', at: 1, amount: 450 },
  { id: 'c1', kind: 'championship', holder: 'Diego y Eva', what: 'Campeonato Primavera · 6ta Libre', when: 'sábado 17 de octubre, 08:00', at: 4,
    amount: 2000, action: { label: 'Cobrar en efectivo', fields: { entryId: 'c1', amount: '2000' } } },
]

describe('MoneyTable', () => {
  it('lists the pairs of a championship as one more kind', async () => {
    render(<MoneyTable caption="Jugado sin pagar" items={ITEMS} amountLabel="Debe" actions={{ booking: done, tournament: done, day_use: done, championship: done }}
      emptyText="Nada" />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Tipo' }), 'championship')
    const pair = screen.getByRole('cell', { name: /Diego y Eva/ }).closest('tr') as HTMLElement
    expect(pair).toHaveTextContent('Campeonato')
    expect(pair).toHaveTextContent('6ta Libre')
  })

  it('lists who owes what, of every kind, with its action', async () => {
    render(<MoneyTable caption="Jugado sin pagar" items={ITEMS} amountLabel="Debe" actions={{ booking: done, tournament: done, day_use: done, championship: done }}
      emptyText="Nada" />)
    const ana = screen.getByRole('cell', { name: /Ana López/ }).closest('tr') as HTMLElement
    expect(ana).toHaveTextContent('Reserva')
    expect(ana).toHaveTextContent('Cancha 1')
    expect(ana).toHaveTextContent('$1.600')
    await userEvent.click(within(ana).getByRole('button', { name: 'Cobrar en efectivo' }))
    await waitFor(() => expect(done).toHaveBeenCalledTimes(1))
    expect(Object.fromEntries(done.mock.calls[0][1].entries())).toEqual({ bookingId: 'b1', amount: '1600' })
    const carla = screen.getByRole('cell', { name: /Carla Ruiz/ }).closest('tr') as HTMLElement
    expect(within(carla).queryByRole('button')).not.toBeInTheDocument()
  })

  it('filters by kind and sorts by amount', async () => {
    render(<MoneyTable caption="Jugado sin pagar" items={ITEMS} amountLabel="Debe" actions={{ booking: done, tournament: done, day_use: done, championship: done }}
      emptyText="Nada" />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Tipo' }), 'tournament')
    expect(screen.getAllByRole('row')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    await userEvent.click(within(screen.getByRole('columnheader', { name: /Debe/ })).getByRole('button'))
    const first = within(screen.getAllByRole('row')[1]).getAllByRole('cell')[0]
    expect(first).toHaveTextContent('Bruno Silva')
  })
})

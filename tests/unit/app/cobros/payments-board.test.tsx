import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PaymentsBoard, type BoardActions } from '@/app/(club)/club/cobros/payments-board'
import type { FormAction } from '@/components/ui/action-form'
import { paymentsBoard, type BoardInput } from '@/lib/domain/payments-board'

const at = (iso: string) => new Date(iso)

const INPUT: BoardInput = {
  transfers: [
    { id: 't1', kind: 'booking', amount: 1600, holder: 'Ana López', startsAt: at('2026-11-19T23:00:00Z'), courtName: 'Cancha 1', receiptUrl: 'https://x/r1.png' },
  ],
  unpaid: [{ bookingId: 'b1', holder: 'Martina', startsAt: at('2026-11-21T23:00:00Z'), courtName: 'Cancha 2', due: 1200 }],
  unpaidEntries: [],
  unpaidPasses: [{ passId: 'p1', holder: 'Carla Ruiz', startsAt: at('2026-11-22T17:00:00Z'), productName: 'Day use pádel', due: 450 }],
  unpaidChampionships: [],
  refunds: [{ paymentId: 'r1', kind: 'booking', holder: 'Gabi', startsAt: at('2026-11-24T23:00:00Z'), courtName: 'Cancha 3', amount: 800 }],
  doneToday: {
    confirmed: [
      { id: 'd1', kind: 'booking', amount: 300, holder: 'Hugo', startsAt: null, courtName: 'Cancha 1', method: 'cash', confirmedAt: at('2026-11-23T14:10:00Z') },
    ],
    refunded: [],
  },
}

const COLUMNS = paymentsBoard(INPUT, {
  when: (instant) => instant.toISOString().slice(0, 10),
  time: (instant) => instant.toISOString().slice(11, 16),
  acceptsCash: true,
})

function renderBoard() {
  const ok = (message: string) => vi.fn<FormAction>(async () => ({ status: 'ok', message }))
  const actions = {
    cash: { booking: ok('Cobrado.'), tournament: ok('Cobrado.'), day_use: ok('Cobrado.'), championship: ok('Cobrado.') },
    refund: ok('Devolución registrada.'),
    confirm: ok('Pago confirmado.'),
    reject: ok('Transferencia rechazada.'),
  } satisfies BoardActions
  render(<PaymentsBoard columns={COLUMNS} actions={actions} />)
  return actions
}

const column = (name: string) => screen.getByRole('region', { name })

describe('PaymentsBoard', () => {
  it('shows the five columns with their count and total, an empty one with its line', () => {
    renderBoard()
    expect(within(column('Sin cobrar')).getByText('2 · $1.650')).toBeInTheDocument()
    expect(within(column('Por confirmar')).getByRole('article', { name: 'Ana López' })).toBeInTheDocument()
    expect(within(column('Cobrado hoy')).getByRole('article', { name: 'Hugo' })).toHaveTextContent('Efectivo · 14:10')
    expect(within(column('A devolver')).getByRole('article', { name: 'Gabi' })).toBeInTheDocument()
    expect(column('Devuelto hoy')).toHaveTextContent('Nada devuelto hoy.')
  })

  it('takes cash with the action of the item’s kind, and marks a refund', async () => {
    const actions = renderBoard()
    const carla = within(column('Sin cobrar')).getByRole('article', { name: 'Carla Ruiz' })
    await userEvent.click(within(carla).getByRole('button', { name: 'Cobrar en efectivo' }))
    await waitFor(() => expect(actions.cash.day_use).toHaveBeenCalledTimes(1))
    expect(Object.fromEntries(actions.cash.day_use.mock.calls[0][1].entries())).toEqual({ passId: 'p1', amount: '450' })
    expect(actions.cash.booking).not.toHaveBeenCalled()

    await userEvent.click(within(column('A devolver')).getByRole('button', { name: 'Marcar devuelto' }))
    await waitFor(() => expect(actions.refund).toHaveBeenCalledTimes(1))
    expect(actions.refund.mock.calls[0][1].get('paymentId')).toBe('r1')
  })

  it('reviews a transfer in a sheet that keeps its outcome', async () => {
    const actions = renderBoard()
    const transfers = column('Por confirmar')
    expect(within(transfers).getByRole('link', { name: 'Ver comprobante de Ana López' })).toHaveAttribute('href', 'https://x/r1.png')
    await userEvent.click(within(transfers).getByRole('button', { name: 'Revisar la transferencia de Ana López' }))
    const sheet = screen.getByRole('dialog', { name: 'Transferencia de Ana López' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(actions.confirm).toHaveBeenCalledTimes(1))
    expect(actions.confirm.mock.calls[0][1].get('paymentId')).toBe('t1')
    expect(await within(sheet).findByRole('status')).toHaveTextContent('Pago confirmado.')
  })

  it('switches lanes with the tabs on a phone, each with what is left to do', async () => {
    renderBoard()
    const collect = screen.getByRole('tab', { name: 'Cobrar 3' })
    const giveBack = screen.getByRole('tab', { name: 'Devolver 1' })
    expect(collect).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('region', { name: 'Devolver' })).toHaveClass('hidden')
    await userEvent.click(giveBack)
    expect(giveBack).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('region', { name: 'Cobrar' })).toHaveClass('hidden')
    expect(screen.getByRole('region', { name: 'Devolver' })).not.toHaveClass('hidden')
  })

  it('searches and filters every column at once', async () => {
    renderBoard()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar por nombre' }), 'cancha 1')
    expect(within(column('Por confirmar')).getByRole('article', { name: 'Ana López' })).toBeInTheDocument()
    expect(within(column('Cobrado hoy')).getByRole('article', { name: 'Hugo' })).toBeInTheDocument()
    expect(column('Sin cobrar')).toHaveTextContent('Nada coincide con la búsqueda.')

    await userEvent.clear(screen.getByRole('searchbox', { name: 'Buscar por nombre' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Tipo' }), 'day_use')
    expect(within(column('Sin cobrar')).getAllByRole('article')).toHaveLength(1)
    expect(within(column('Sin cobrar')).getByText('1 · $450')).toBeInTheDocument()
  })
})

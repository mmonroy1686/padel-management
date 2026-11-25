import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PaymentsBoard, type BoardActions } from '@/app/(club)/club/cobros/payments-board'
import type { FormAction } from '@/components/ui/action-form'
import { paymentsBoard, type BoardInput } from '@/lib/domain/payments-board'

const at = (iso: string) => new Date(iso)

// jsdom draws nothing, so it has no scrollIntoView; a tile calls it to bring its column into view.
Element.prototype.scrollIntoView = vi.fn()

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
    rejected: [
      { id: 'd2', kind: 'booking', amount: 1200, holder: 'Kevin', startsAt: null, courtName: 'Cancha 2', method: 'transfer', confirmedAt: at('2026-11-23T16:00:00Z'), reason: 'No llegó la plata' },
    ],
  },
}

const COLUMNS = paymentsBoard(INPUT, {
  when: (instant) => instant.toISOString().slice(0, 10),
  time: (instant) => instant.toISOString().slice(11, 16),
  deskMethods: ['cash'],
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
  it('sums up what is owed, waiting, in and to give back on top', () => {
    renderBoard()
    const summary = screen.getByRole('navigation', { name: 'Resumen de cobros' })
    expect(within(summary).getByRole('button', { name: /Sin cobrar/ })).toHaveTextContent('$1.650')
    expect(within(summary).getByRole('button', { name: /Sin cobrar/ })).toHaveTextContent('2 deudas')
    expect(within(summary).getByRole('button', { name: /Cobrado hoy/ })).toHaveTextContent('$300 en efectivo')
    expect(within(summary).getByRole('button', { name: /A devolver/ })).toHaveTextContent('$800')
  })

  it('shows the Cobrar lane with its columns, the rejected transfer with its reason', () => {
    renderBoard()
    expect(within(column('Sin cobrar')).getByText('2 · $1.650')).toBeInTheDocument()
    expect(within(column('Por confirmar')).getByRole('article', { name: 'Ana López' })).toBeInTheDocument()
    expect(within(column('Cobrado hoy')).getByRole('article', { name: 'Hugo' })).toHaveTextContent('Efectivo · 14:10')
    expect(column('Cobrado hoy')).toHaveTextContent('En efectivo: $300')
    expect(within(column('Rechazado hoy')).getByRole('article', { name: 'Kevin' })).toHaveTextContent('Rechazada · 16:00 · No llegó la plata')
    expect(screen.queryByRole('region', { name: 'A devolver' })).not.toBeInTheDocument()
  })

  it('takes cash with the action of the item’s kind, and marks a refund', async () => {
    const actions = renderBoard()
    const carla = within(column('Sin cobrar')).getByRole('article', { name: 'Carla Ruiz' })
    // Cobrar asks how the player paid, as on Inicio.
    await userEvent.click(within(carla).getByRole('button', { name: 'Cobrar $450 a Carla Ruiz' }))
    await userEvent.click(within(within(carla).getByRole('group', { name: 'Cobrar $450 a Carla Ruiz' })).getByRole('button', { name: 'Efectivo' }))
    await waitFor(() => expect(actions.cash.day_use).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('status')).toHaveTextContent('Cobrado a Carla Ruiz.')
    expect(Object.fromEntries(actions.cash.day_use.mock.calls[0][1].entries())).toEqual({ passId: 'p1', amount: '450', method: 'cash' })
    expect(actions.cash.booking).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Devolver 1' }))
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

  it('switches lanes with the toggles, each with what is left to do, and a tile opens its lane', async () => {
    renderBoard()
    const collect = screen.getByRole('button', { name: 'Cobrar 3' })
    const giveBack = screen.getByRole('button', { name: 'Devolver 1' })
    expect(collect).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(giveBack)
    expect(giveBack).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('region', { name: 'Sin cobrar' })).not.toBeInTheDocument()
    expect(column('Devuelto hoy')).toHaveTextContent('Nada devuelto hoy.')
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Resumen de cobros' })).getByRole('button', { name: /Sin cobrar/ }))
    expect(collect).toHaveAttribute('aria-pressed', 'true')
    expect(column('Sin cobrar')).toBeInTheDocument()
  })

  it('searches and filters every column at once', async () => {
    renderBoard()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar por nombre o cancha' }), 'cancha 1')
    expect(within(column('Por confirmar')).getByRole('article', { name: 'Ana López' })).toBeInTheDocument()
    expect(within(column('Cobrado hoy')).getByRole('article', { name: 'Hugo' })).toBeInTheDocument()
    expect(column('Sin cobrar')).toHaveTextContent('Nada coincide con la búsqueda.')

    await userEvent.clear(screen.getByRole('searchbox', { name: 'Buscar por nombre o cancha' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Tipo' }), 'day_use')
    expect(within(column('Sin cobrar')).getAllByRole('article')).toHaveLength(1)
    expect(within(column('Sin cobrar')).getByText('1 · $450')).toBeInTheDocument()
  })
})

describe('PaymentsBoard, for the desk', () => {
  const debt = (bookingId: string, holder: string, iso: string) => ({ bookingId, holder, startsAt: at(iso), courtName: 'Cancha 1', due: 1000 })
  const noop = () => vi.fn<FormAction>(async () => ({ status: 'ok', message: 'Listo.' }))
  const baseActions = () => ({
    cash: { booking: noop(), tournament: noop(), day_use: noop(), championship: noop() },
    refund: noop(),
    confirm: noop(),
    reject: noop(),
  })

  it('keeps today row by row and groups a player who owes from several older days', () => {
    const columns = paymentsBoard(
      {
        ...INPUT,
        unpaid: [debt('b1', 'Sofía', '2026-11-20T23:00:00Z'), debt('b2', 'Sofía', '2026-11-21T23:00:00Z'), debt('b3', 'Leo', '2026-11-25T15:00:00Z')],
        unpaidPasses: [],
      },
      { when: () => '', time: () => '', deskMethods: ['cash'] },
    )
    render(<PaymentsBoard columns={columns} todayFrom={at('2026-11-25T03:00:00Z').getTime()} actions={baseActions()} />)
    const unpaid = column('Sin cobrar')
    expect(within(unpaid).getByRole('article', { name: 'Leo' })).toBeInTheDocument()
    const groups = within(unpaid).getByRole('list', { name: 'Deudas por jugador' })
    expect(groups).toHaveTextContent('Sofía')
    expect(groups).toHaveTextContent('2 deudas')
    expect(groups).toHaveTextContent('$2.000')
  })

  it('confirms the marked transfers at once', async () => {
    const confirmMany = vi.fn<FormAction>(async () => ({ status: 'ok', message: '2 transferencias confirmadas.' }))
    const columns = paymentsBoard(
      {
        ...INPUT,
        transfers: [
          { id: 't1', kind: 'booking', amount: 1600, holder: 'Ana López', startsAt: at('2026-11-19T23:00:00Z'), courtName: 'Cancha 1', receiptUrl: null },
          { id: 't2', kind: 'booking', amount: 1200, holder: 'Bruno', startsAt: at('2026-11-20T23:00:00Z'), courtName: 'Cancha 2', receiptUrl: null },
        ],
      },
      { when: () => '', time: () => '', deskMethods: ['cash'] },
    )
    render(<PaymentsBoard columns={columns} actions={{ ...baseActions(), confirmMany }} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Marcar la transferencia de Ana López' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Marcar la transferencia de Bruno' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar las marcadas (2)' }))
    await waitFor(() => expect(confirmMany).toHaveBeenCalledTimes(1))
    expect(confirmMany.mock.calls[0][1].getAll('paymentId')).toEqual(['t1', 't2'])
    expect(await screen.findByRole('status')).toHaveTextContent('2 transferencias confirmadas.')
  })
})

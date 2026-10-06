import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PairsBoard, type PairsActions } from '@/components/championships/pairs-board'
import type { FormAction } from '@/components/ui/action-form'
import { pairsCategories, type PairsCategory } from '@/lib/domain/championship-pairs'
import { championshipBlocks } from '@/lib/domain/championships'
import { BRUNO, LUCIA, makeCategory, makeChampionship, makeEntry } from '../../fixtures/championships'

const ok = async () => ({ status: 'ok' as const, message: 'Listo.' })
const CHAMPIONSHIP = makeChampionship({
  categories: [
    makeCategory({ maxPairs: 1, entries: [makeEntry({ id: 'e1' }), makeEntry({ id: 'e2', player1: BRUNO, player2: LUCIA, status: 'waiting' })] }),
    makeCategory({ id: 'k2', name: '5ta Damas' }),
  ],
})
const CATEGORIES: PairsCategory[] = pairsCategories(CHAMPIONSHIP, new Map())

function actions(): PairsActions {
  return {
    cash: vi.fn<FormAction>(ok),
    remove: vi.fn<FormAction>(ok),
    move: vi.fn<FormAction>(ok),
    add: vi.fn<FormAction>(ok),
    hours: vi.fn<FormAction>(ok),
  }
}

function renderBoard(editable = true) {
  const steps = actions()
  render(
    <PairsBoard
      categories={CATEGORIES}
      editable={editable}
      acceptsCash
      members={[{ userId: '66666666-6666-6666-6666-666666666666', name: 'Bruno Silva' }]}
      blocks={championshipBlocks(CHAMPIONSHIP.windows)}
      actions={steps}
    />,
  )
  return steps
}

describe('PairsBoard', () => {
  it('shows each category as a table, with places and the waiting line', () => {
    renderBoard()
    const libre = screen.getByRole('region', { name: '6ta Libre' })
    expect(libre).toHaveTextContent('1 de 1 parejas · 1 en espera')
    const ana = within(libre).getByRole('row', { name: /Ana y Pedro/ })
    expect(ana).toHaveTextContent('Con lugar')
    expect(ana).toHaveTextContent('Pendiente de pago')
    expect(within(libre).getByRole('row', { name: /Bruno y Lucía/ })).toHaveTextContent('En espera, puesto 1')
    expect(screen.getByRole('region', { name: '5ta Damas' })).toHaveTextContent('Todavía no hay parejas en esta categoría.')
  })

  it('filters the waiting line', async () => {
    renderBoard()
    const libre = screen.getByRole('region', { name: '6ta Libre' })
    await userEvent.selectOptions(within(libre).getByRole('combobox', { name: 'Estado' }), 'waiting')
    expect(within(libre).queryByRole('row', { name: /Ana y Pedro/ })).not.toBeInTheDocument()
    expect(within(libre).getByRole('row', { name: /Bruno y Lucía/ })).toBeInTheDocument()
  })

  it('charges cash to a pair with a place that owes', async () => {
    const steps = renderBoard()
    const ana = within(screen.getByRole('region', { name: '6ta Libre' })).getByRole('row', { name: /Ana y Pedro/ })
    await userEvent.click(within(ana).getByRole('button', { name: 'Cobrar $2.000' }))
    await waitFor(() => expect(steps.cash).toHaveBeenCalled())
    const sent = vi.mocked(steps.cash).mock.calls[0][1]
    expect(sent.get('entryId')).toBe('e1')
    expect(sent.get('amount')).toBe('2000')
    const bruno = within(screen.getByRole('region', { name: '6ta Libre' })).getByRole('row', { name: /Bruno y Lucía/ })
    expect(within(bruno).queryByRole('button', { name: /Cobrar/ })).not.toBeInTheDocument()
  })

  it('moves a pair to another category', async () => {
    const steps = renderBoard()
    const ana = within(screen.getByRole('region', { name: '6ta Libre' })).getByRole('row', { name: /Ana y Pedro/ })
    await userEvent.click(within(ana).getByRole('button', { name: 'Mover' }))
    const sheet = screen.getByRole('dialog', { name: 'Mover a otra categoría' })
    expect(within(sheet).getAllByRole('option').map((option) => option.textContent)).toEqual(['5ta Damas'])
    await userEvent.click(within(sheet).getByRole('button', { name: 'Mover' }))
    await waitFor(() => expect(steps.move).toHaveBeenCalled())
    expect(Object.fromEntries(vi.mocked(steps.move).mock.calls[0][1].entries())).toEqual({ entryId: 'e1', categoryId: 'k2' })
  })

  it('asks before taking a pair out', async () => {
    const steps = renderBoard()
    const bruno = within(screen.getByRole('region', { name: '6ta Libre' })).getByRole('row', { name: /Bruno y Lucía/ })
    await userEvent.click(within(bruno).getByRole('button', { name: 'Quitar' }))
    const sheet = screen.getByRole('dialog', { name: 'Quitar pareja' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Sí, quitar la pareja' }))
    await waitFor(() => expect(steps.remove).toHaveBeenCalled())
    expect(vi.mocked(steps.remove).mock.calls[0][1].get('entryId')).toBe('e2')
    expect(await screen.findByRole('status')).toHaveTextContent('Listo.')
  })

  it('opens the hours of a pair with no limit, and loads a whole pair', async () => {
    const steps = renderBoard()
    const ana = within(screen.getByRole('region', { name: '6ta Libre' })).getByRole('row', { name: /Ana y Pedro/ })
    await userEvent.click(within(ana).getByRole('button', { name: 'Horarios' }))
    expect(screen.getByRole('dialog', { name: 'Horarios imposibles' })).toHaveTextContent('Son 6 franjas')
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

    await userEvent.click(screen.getByRole('button', { name: 'Cargar pareja' }))
    const sheet = screen.getByRole('dialog', { name: 'Cargar pareja' })
    await userEvent.selectOptions(within(sheet).getByRole('combobox', { name: 'Categoría' }), 'k2')
    const first = within(sheet).getByRole('group', { name: 'Jugador 1' })
    await userEvent.type(within(first).getByRole('combobox', { name: 'Nombre' }), 'bru')
    await userEvent.click(within(first).getByRole('option', { name: 'Bruno Silva' }))
    const second = within(sheet).getByRole('group', { name: 'Jugador 2' })
    await userEvent.click(within(second).getByRole('radio', { name: 'Es de afuera' }))
    await userEvent.type(within(second).getByRole('textbox', { name: 'Nombre y apellido' }), 'Lucía Pérez')
    await userEvent.type(within(second).getByRole('textbox', { name: 'Teléfono' }), '099111002')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Cargar pareja' }))
    await waitFor(() => expect(steps.add).toHaveBeenCalled())
    expect(Object.fromEntries(vi.mocked(steps.add).mock.calls[0][1].entries())).toEqual({
      categoryId: 'k2',
      player1Kind: 'member',
      player1ProfileId: '66666666-6666-6666-6666-666666666666',
      player1Level: '5',
      player2Kind: 'guest',
      player2Name: 'Lucía Pérez',
      player2Phone: '099111002',
      player2Level: '5',
      note: '',
    })
  })

  it('only charges once the draw is done', () => {
    renderBoard(false)
    expect(screen.queryByRole('button', { name: 'Cargar pareja' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Quitar' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cobrar $2.000' })).toBeInTheDocument()
  })
})

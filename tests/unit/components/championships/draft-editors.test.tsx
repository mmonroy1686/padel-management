import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CategoriesEditor } from '@/components/championships/categories-editor'
import { WindowsEditor } from '@/components/championships/windows-editor'
import type { FormAction } from '@/components/ui/action-form'

const ok = async () => ({ status: 'ok' as const, message: 'Listo.' })
const COURTS = [
  { id: 'court-1', name: 'Cancha 1' },
  { id: 'court-2', name: 'Cancha 2' },
]

describe('WindowsEditor', () => {
  it('lists the days of play, deletes one and adds another on the courts chosen', async () => {
    const add = vi.fn<FormAction>(ok)
    const remove = vi.fn<FormAction>(ok)
    render(
      <WindowsEditor
        championshipId="ch1"
        windows={[{ id: 'w1', text: 'sábado 17 de octubre, 08:00 a 14:00', courts: 'Cancha 1 y Cancha 2' }]}
        courts={COURTS}
        fromTimes={['08:00', '08:30', '09:00']}
        toTimes={['08:30', '09:00', '23:00']}
        today="2026-10-06"
        addAction={add}
        deleteAction={remove}
      />,
    )
    const region = screen.getByRole('region', { name: 'Días de juego' })
    const item = within(region).getByRole('listitem')
    expect(item).toHaveTextContent('sábado 17 de octubre, 08:00 a 14:00')
    expect(item).toHaveTextContent('Cancha 1 y Cancha 2')
    await userEvent.click(within(item).getByRole('button', { name: 'Quitar' }))
    await waitFor(() => expect(remove).toHaveBeenCalled())
    expect(remove.mock.calls[0][1].get('windowId')).toBe('w1')

    expect(within(region).getByLabelText('Hasta')).toHaveValue('23:00')
    fireEvent.change(within(region).getByLabelText('Día'), { target: { value: '2026-10-18' } })
    await userEvent.click(within(region).getByLabelText('Cancha 2'))
    await userEvent.click(within(region).getByRole('button', { name: 'Agregar día' }))
    await waitFor(() => expect(add).toHaveBeenCalled())
    const sent = add.mock.calls[0][1]
    expect(sent.get('championshipId')).toBe('ch1')
    expect(sent.get('date')).toBe('2026-10-18')
    expect(sent.get('fromTime')).toBe('08:00')
    expect(sent.getAll('courtIds')).toEqual(['court-1'])
  })
})

describe('CategoriesEditor', () => {
  it('lists the categories and adds one starting from the defaults', async () => {
    const add = vi.fn<FormAction>(ok)
    render(
      <CategoriesEditor
        championshipId="ch1"
        categories={[{ id: 'k1', name: '6ta Libre', detail: 'Libre · $2.000 por pareja' }]}
        addAction={add}
        deleteAction={vi.fn<FormAction>(ok)}
      />,
    )
    const region = screen.getByRole('region', { name: 'Categorías' })
    expect(within(region).getByRole('listitem')).toHaveTextContent('6ta Libre')
    expect(within(region).getByLabelText('Máximo de parejas')).toHaveValue(16)
    expect(within(region).getByLabelText('Tercer set')).toHaveValue('super_tiebreak')
    await userEvent.type(within(region).getByLabelText('Nombre'), '5ta Damas')
    await userEvent.selectOptions(within(region).getByLabelText('Género'), 'women')
    await userEvent.clear(within(region).getByLabelText('Máximo de parejas'))
    await userEvent.type(within(region).getByLabelText('Máximo de parejas'), '8')
    await userEvent.click(within(region).getByLabelText('Punto de oro'))
    await userEvent.click(within(region).getByRole('button', { name: 'Agregar categoría' }))
    await waitFor(() => expect(add).toHaveBeenCalled())
    expect(Object.fromEntries(add.mock.calls[0][1].entries())).toEqual({
      championshipId: 'ch1',
      name: '5ta Damas',
      gender: 'women',
      levelMin: '',
      levelMax: '',
      minPairs: '4',
      maxPairs: '8',
      price: '2000',
      format: 'groups_knockout',
      groupSize: '4',
      qualifiers: '2',
      matchMinutes: '90',
      seeding: 'ranking',
      timeLimitMode: 'none',
      timeLimit: '60',
      thirdSet: 'super_tiebreak',
      goldenPoint: 'on',
    })
  })
})

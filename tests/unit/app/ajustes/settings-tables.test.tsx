import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CourtsTable, PricesTable } from '@/app/(club)/club/ajustes/settings-tables'
import type { FormAction } from '@/components/ui/action-form'

const ok = async () => ({ status: 'ok' as const, message: 'Listo.' })

describe('CourtsTable', () => {
  const COURTS = [
    { id: 'c1', name: 'Cancha 1', is_covered: true, is_active: true },
    { id: 'c2', name: 'Cancha 3', is_covered: false, is_active: false },
  ]

  it('lists the courts and edits one in a sheet', async () => {
    const update = vi.fn<FormAction>(ok)
    render(<CourtsTable courts={COURTS} updateAction={update} deleteAction={vi.fn<FormAction>(ok)} />)
    const three = screen.getByRole('cell', { name: 'Cancha 3' }).closest('tr') as HTMLElement
    expect(three).toHaveTextContent('Al aire libre')
    expect(three).toHaveTextContent('Inactiva')
    await userEvent.click(within(three).getByRole('button', { name: 'Editar Cancha 3' }))
    const sheet = screen.getByRole('dialog', { name: 'Cancha 3' })
    await userEvent.click(within(sheet).getByRole('checkbox', { name: /Activa/ }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Guardar cancha' }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(Object.fromEntries(update.mock.calls[0][1].entries())).toEqual({ courtId: 'c2', name: 'Cancha 3', is_active: 'on' })
  })
})

describe('PricesTable', () => {
  it('lists each price band and deletes one', async () => {
    const remove = vi.fn<FormAction>(ok)
    render(
      <PricesTable
        rules={[{ id: 'r1', weekdays: [1, 2, 3, 4, 5], from_time: '18:30:00', to_time: '24:00:00', price: 1600 }]}
        deleteAction={remove}
      />,
    )
    const row = screen.getAllByRole('row')[1]
    expect(row).toHaveTextContent('18:30')
    expect(row).toHaveTextContent('24:00')
    expect(row).toHaveTextContent('$1.600')
    await userEvent.click(within(row).getByRole('button', { name: 'Borrar' }))
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1))
    expect(remove.mock.calls[0][1].get('ruleId')).toBe('r1')
  })
})

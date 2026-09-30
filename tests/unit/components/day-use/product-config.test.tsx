import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OverrideCalendar } from '@/components/day-use/override-calendar'
import { ProductForm } from '@/components/day-use/product-form'
import type { FormAction } from '@/components/ui/action-form'
import { makeProduct } from '../../fixtures/day-use'

const COURTS = [
  { id: 'c1', name: 'Cancha 1' },
  { id: 'c2', name: 'Cancha 2' },
]
const DAYS = [
  { date: '2026-10-01', label: 'Hoy' },
  { date: '2026-10-03', label: 'sáb 3' },
]

describe('ProductForm', () => {
  it('proposes the example pass when creating one', () => {
    render(<ProductForm product={null} courts={COURTS} action={vi.fn<FormAction>()} idPrefix="nuevo" />)
    expect(screen.getByLabelText('Nombre')).toHaveValue('Day use completo')
    expect(screen.getByLabelText('Precio')).toHaveValue(450)
    expect(screen.getByLabelText('Cupo por día')).toHaveValue(30)
    expect(screen.getByLabelText('Qué incluye (separado por comas)')).toHaveValue('Vestuarios, Pileta, Cancha libre')
    expect(screen.getByLabelText('sáb')).toBeChecked()
    expect(screen.getByLabelText('dom')).toBeChecked()
    expect(screen.getByLabelText('lun')).not.toBeChecked()
    expect(screen.getByLabelText('Desde')).toHaveValue('08:00')
    expect(screen.getByLabelText('Hasta')).toHaveValue('12:30')
    expect(screen.getByLabelText('Cancha 1')).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Crear pase' })).toBeInTheDocument()
    expect(document.querySelector('input[name="productId"]')).toBeNull()
  })

  it('fills in the pass being edited', () => {
    render(
      <ProductForm
        product={makeProduct({ name: 'Pileta', weekdays: [1], courtIds: ['c2'] })}
        courts={COURTS}
        action={vi.fn<FormAction>()}
        idPrefix="p1"
      />,
    )
    expect(screen.getByLabelText('Nombre')).toHaveValue('Pileta')
    expect(screen.getByLabelText('lun')).toBeChecked()
    expect(screen.getByLabelText('sáb')).not.toBeChecked()
    expect(screen.getByLabelText('Cancha 2')).toBeChecked()
    expect(screen.getByRole('button', { name: 'Guardar pase' })).toBeInTheDocument()
    expect(document.querySelector<HTMLInputElement>('input[name="productId"]')?.value).toBe('p1')
  })
})

describe('OverrideCalendar', () => {
  const cellsOf = (name: RegExp) => within(screen.getByRole('row', { name })).getAllByRole('cell')

  it('shows each pass on each day, open or closed, and marks the exceptions', () => {
    render(
      <OverrideCalendar
        products={[makeProduct({ weekdays: [6, 0] })]}
        days={DAYS}
        overrides={[{ productId: 'p1', date: '2026-10-01', enabled: true }]}
        action={vi.fn<FormAction>()}
      />,
    )
    const cells = cellsOf(/Day use completo/)
    expect(cells[0]).toHaveTextContent('Abierto')
    expect(cells[0]).toHaveTextContent('Excepción')
    expect(cells[1]).toHaveTextContent('Abierto')
    expect(cells[1]).not.toHaveTextContent('Excepción')
  })

  it('toggles a single date', () => {
    render(<OverrideCalendar products={[makeProduct({ weekdays: [6, 0] })]} days={DAYS} overrides={[]} action={vi.fn<FormAction>()} />)
    const cells = cellsOf(/Day use completo/)
    expect(within(cells[0]).getByRole('button', { name: 'Cerrado' })).toBeInTheDocument()
    expect(cells[0].querySelector('input[name="enabled"]')).toHaveValue('true')
    expect(cells[1].querySelector('input[name="enabled"]')).toHaveValue('false')
    expect(cells[1].querySelector('input[name="date"]')).toHaveValue('2026-10-03')
  })
})

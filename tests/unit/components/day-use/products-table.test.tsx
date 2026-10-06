import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ProductsTable } from '@/components/day-use/products-table'
import type { FormAction } from '@/components/ui/action-form'
import { makeProduct } from '../../fixtures/day-use'

const ok = async () => ({ status: 'ok' as const, message: 'Listo.' })

describe('ProductsTable', () => {
  const PRODUCTS = [
    makeProduct(),
    makeProduct({ id: 'p2', name: 'Day use pádel', weekdays: [0, 6], fromTime: '14:00', toTime: '17:00', price: 600, capacity: 16, isActive: false }),
  ]

  it('lists each pass with its days, hours, price, places and status', () => {
    render(<ProductsTable products={PRODUCTS} courts={[]} saveAction={vi.fn<FormAction>(ok)} activeAction={vi.fn<FormAction>(ok)} />)
    const padel = screen.getByRole('cell', { name: 'Day use pádel' }).closest('tr') as HTMLElement
    expect(padel).toHaveTextContent('Sábados y domingos')
    expect(padel).toHaveTextContent('14:00 a 17:00')
    expect(padel).toHaveTextContent('$600')
    expect(padel).toHaveTextContent('16')
    expect(padel).toHaveTextContent('Inactivo')
  })

  it('edits a pass in a sheet and turns it on or off from the row', async () => {
    const active = vi.fn<FormAction>(ok)
    render(<ProductsTable products={PRODUCTS} courts={[]} saveAction={vi.fn<FormAction>(ok)} activeAction={active} />)
    const padel = screen.getByRole('cell', { name: 'Day use pádel' }).closest('tr') as HTMLElement
    await userEvent.click(within(padel).getByRole('button', { name: 'Activar' }))
    await waitFor(() => expect(active).toHaveBeenCalledTimes(1))
    expect(Object.fromEntries(active.mock.calls[0][1].entries())).toEqual({ productId: 'p2', active: 'true' })
    await userEvent.click(within(padel).getByRole('button', { name: 'Editar Day use pádel' }))
    expect(within(screen.getByRole('dialog', { name: 'Day use pádel' })).getByRole('button', { name: 'Guardar pase' })).toBeInTheDocument()
  })
})

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SmallCategories } from '@/components/championships/small-categories'
import type { FormAction } from '@/components/ui/action-form'

const ok = async () => ({ status: 'ok' as const, message: 'Listo.' })

describe('SmallCategories', () => {
  it('merges a category with too few pairs into another, or cancels it', async () => {
    const merge = vi.fn<FormAction>(ok)
    const cancel = vi.fn<FormAction>(ok)
    render(
      <SmallCategories
        categories={[{ id: 'k2', name: '5ta Damas', text: '1 pareja de 4 mínimas' }]}
        targets={[
          { id: 'k1', name: '6ta Libre' },
          { id: 'k2', name: '5ta Damas' },
          { id: 'k3', name: '4ta' },
        ]}
        actions={{ merge, cancel }}
      />,
    )
    const item = within(screen.getByRole('region', { name: 'Categorías con pocas parejas' })).getByRole('listitem')
    expect(item).toHaveTextContent('5ta Damas: 1 pareja de 4 mínimas')
    const into = within(item).getByRole('combobox', { name: 'Fusionar 5ta Damas con' })
    expect([...(into as HTMLSelectElement).options].map((option) => option.textContent)).toEqual(['6ta Libre', '4ta'])
    await userEvent.selectOptions(into, 'k3')
    await userEvent.click(within(item).getByRole('button', { name: 'Fusionar' }))
    await waitFor(() => expect(merge).toHaveBeenCalled())
    expect(Object.fromEntries(merge.mock.calls[0][1].entries())).toEqual({ categoryId: 'k2', intoId: 'k3' })
    await userEvent.click(within(item).getByRole('button', { name: 'Cancelar categoría' }))
    await waitFor(() => expect(cancel).toHaveBeenCalled())
    expect(cancel.mock.calls[0][1].get('categoryId')).toBe('k2')
  })
})

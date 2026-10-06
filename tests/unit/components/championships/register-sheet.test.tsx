import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RegisterSheet, type RegisterOption } from '@/components/championships/register-sheet'
import type { FormAction } from '@/components/ui/action-form'

const OPTIONS: RegisterOption[] = [
  { id: 'k1', name: '6ta Libre', detail: 'Libre · $2.000 por pareja', full: false, available: true },
  { id: 'k2', name: '5ta Damas', detail: 'Damas · $1.800 por pareja', full: true, available: true },
  { id: 'k3', name: '4ta', detail: 'Libre · $2.000 por pareja', full: false, available: false },
]
const MEMBERS = [
  { userId: '66666666-6666-6666-6666-666666666666', name: 'Bruno Silva' },
  { userId: '77777777-7777-7777-7777-777777777777', name: 'Carla Ruiz' },
]

function renderSheet(initialCategoryId: string | null = 'k1') {
  const action = vi.fn<FormAction>(async () => ({ status: 'ok', message: 'Listo, quedaron anotados.' }))
  const onDone = vi.fn()
  render(
    <RegisterSheet options={OPTIONS} initialCategoryId={initialCategoryId} myLevel={6} members={MEMBERS} action={action} onClose={vi.fn()} onDone={onDone} />,
  )
  return { action, onDone, sheet: screen.getByRole('dialog', { name: 'Anotarme' }) }
}

describe('RegisterSheet', () => {
  it('signs up with a member picked from the list', async () => {
    const { action, onDone, sheet } = renderSheet()
    expect(within(sheet).getByRole('combobox', { name: 'Categoría' })).toHaveValue('k1')
    expect(within(sheet).getByRole('option', { name: '4ta' })).toBeDisabled()
    expect(within(sheet).getByRole('combobox', { name: 'Tu categoría' })).toHaveValue('6')
    await userEvent.type(within(sheet).getByRole('combobox', { name: 'Nombre' }), 'bru')
    await userEvent.click(within(sheet).getByRole('option', { name: 'Bruno Silva' }))
    await userEvent.selectOptions(within(sheet).getByRole('combobox', { name: 'Categoría que juega' }), '5')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Anotarnos' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('Listo, quedaron anotados.'))
    expect(Object.fromEntries(action.mock.calls[0][1].entries())).toEqual({
      categoryId: 'k1',
      myLevel: '6',
      partnerKind: 'member',
      partnerProfileId: '66666666-6666-6666-6666-666666666666',
      partnerLevel: '5',
    })
  })

  it('signs up with a partner from outside, and warns when the category is full', async () => {
    const { action, sheet } = renderSheet('k2')
    expect(within(sheet).getByText(/No quedan lugares/)).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('radio', { name: 'Es de afuera' }))
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Nombre y apellido' }), 'Pedro Pérez')
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Teléfono' }), '099 123 456')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Anotarnos en la lista de espera' }))
    await waitFor(() => expect(action).toHaveBeenCalled())
    expect(Object.fromEntries(action.mock.calls[0][1].entries())).toMatchObject({
      categoryId: 'k2',
      partnerKind: 'guest',
      partnerName: 'Pedro Pérez',
      partnerPhone: '099 123 456',
    })
  })

  it('starts on the first category that takes pairs when none was chosen', () => {
    const { sheet } = renderSheet(null)
    expect(within(sheet).getByRole('combobox', { name: 'Categoría' })).toHaveValue('k1')
  })
})

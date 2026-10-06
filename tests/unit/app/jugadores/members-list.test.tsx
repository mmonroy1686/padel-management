import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MembersList } from '@/app/(club)/club/jugadores/members-list'
import type { FormAction } from '@/components/ui/action-form'
import type { MemberView } from '@/lib/domain/members'

const MEMBERS: MemberView[] = [
  { userId: 'u1', name: 'Martín Pérez', role: 'player', category: 5, validated: true },
  { userId: 'u2', name: 'Ana López', role: 'player', category: 6, validated: false },
  { userId: 'admin', name: 'Dani Admin', role: 'admin', category: null, validated: false },
]

function renderList(canChangeRoles: boolean) {
  const validateAction = vi.fn<FormAction>(async () => ({ status: 'ok', message: 'Categoría validada.' }))
  const roleAction = vi.fn<FormAction>(async () => ({ status: 'ok', message: 'Rol actualizado.' }))
  render(
    <MembersList
      members={MEMBERS}
      viewerId="admin"
      canChangeRoles={canChangeRoles}
      validateAction={validateAction}
      roleAction={roleAction}
    />,
  )
  return { validateAction, roleAction }
}

const rowOf = (name: string) => screen.getByRole('cell', { name: new RegExp(name) }).closest('tr') as HTMLElement

describe('MembersList', () => {
  it('lists the members in a table with role and category', () => {
    renderList(false)
    expect(screen.getByRole('table', { name: 'Jugadores del club' })).toBeInTheDocument()
    expect(rowOf('Ana López')).toHaveTextContent('Jugador')
    expect(rowOf('Ana López')).toHaveTextContent('6ª')
    expect(rowOf('Ana López')).toHaveTextContent('Sin validar')
    expect(rowOf('Martín Pérez')).toHaveTextContent('Validada')
  })

  it('filters as you type, and by the categories still to validate', async () => {
    renderList(false)
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar jugador' }), 'ana')
    expect(screen.getByRole('cell', { name: /Ana López/ })).toBeInTheDocument()
    expect(screen.queryByRole('cell', { name: /Martín Pérez/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Validación' }), 'pending')
    expect(screen.queryByRole('cell', { name: /Martín Pérez/ })).not.toBeInTheDocument()
    expect(screen.getByRole('cell', { name: /Ana López/ })).toBeInTheDocument()
  })

  it('validates a pending category from the edit sheet', async () => {
    const { validateAction } = renderList(false)
    await userEvent.click(within(rowOf('Ana López')).getByRole('button', { name: 'Editar a Ana López' }))
    const sheet = screen.getByRole('dialog', { name: 'Ana López' })
    await userEvent.selectOptions(within(sheet).getByLabelText('Categoría'), '5ª')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Validar categoría' }))
    await waitFor(() => expect(validateAction).toHaveBeenCalledTimes(1))
    expect(Object.fromEntries(validateAction.mock.calls[0][1].entries())).toEqual({ userId: 'u2', category: '5' })
  })

  it('hides role controls from reception', async () => {
    renderList(false)
    await userEvent.click(within(rowOf('Ana López')).getByRole('button', { name: 'Editar a Ana López' }))
    expect(screen.queryByRole('button', { name: 'Cambiar rol' })).not.toBeInTheDocument()
  })

  it("lets an admin change other people's roles, not their own", async () => {
    renderList(true)
    await userEvent.click(within(rowOf('Ana López')).getByRole('button', { name: 'Editar a Ana López' }))
    expect(screen.getByRole('button', { name: 'Cambiar rol' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    await userEvent.click(within(rowOf('Dani Admin')).getByRole('button', { name: 'Editar a Dani Admin' }))
    expect(screen.queryByRole('button', { name: 'Cambiar rol' })).not.toBeInTheDocument()
  })
})

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

describe('MembersList', () => {
  it('filters as you type', async () => {
    renderList(false)
    await userEvent.type(screen.getByLabelText('Buscar jugador'), 'ana')
    expect(screen.getByText('Ana López')).toBeInTheDocument()
    expect(screen.queryByText('Martín Pérez')).not.toBeInTheDocument()
  })

  it('validates a pending category', async () => {
    const { validateAction } = renderList(false)
    const ana = screen.getByText('Ana López').closest('li') as HTMLElement
    await userEvent.selectOptions(within(ana).getByLabelText('Categoría de Ana López'), '5ª')
    await userEvent.click(within(ana).getByRole('button', { name: 'Validar categoría' }))
    await waitFor(() => expect(validateAction).toHaveBeenCalledTimes(1))
    expect(Object.fromEntries(validateAction.mock.calls[0][1].entries())).toEqual({ userId: 'u2', category: '5' })
  })

  it('hides role controls from reception', () => {
    renderList(false)
    expect(screen.queryByRole('button', { name: 'Cambiar rol' })).not.toBeInTheDocument()
  })

  it('lets an admin change other people\'s roles', () => {
    renderList(true)
    expect(screen.getAllByRole('button', { name: 'Cambiar rol' })).toHaveLength(2)
    expect(screen.queryByLabelText('Rol de Dani Admin')).not.toBeInTheDocument()
  })
})

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { GroupOrderForm } from '@/components/championships/group-order-form'
import type { FormAction } from '@/components/ui/action-form'

const ok = async () => ({ status: 'ok' as const, message: 'Zona cerrada.' })

describe('GroupOrderForm', () => {
  it('closes a group in the order the organizer chose after a tie', async () => {
    const action = vi.fn<FormAction>(ok)
    render(
      <GroupOrderForm
        groupId="g1"
        rows={[
          { entryId: 'e1', name: 'Ana y Pedro' },
          { entryId: 'e2', name: 'Bruno y Lucía' },
        ]}
        tiedNames={['Ana y Pedro y Bruno y Lucía']}
        action={action}
      />,
    )
    expect(
      screen.getByText('Hay un empate que decide el organizador (por sorteo): ordená la zona y cerrala.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Puesto de Ana y Pedro')).toHaveValue('1')
    await userEvent.selectOptions(screen.getByLabelText('Puesto de Ana y Pedro'), '2')
    await userEvent.selectOptions(screen.getByLabelText('Puesto de Bruno y Lucía'), '1')
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar zona' }))
    await waitFor(() => expect(action).toHaveBeenCalled())
    const form = vi.mocked(action).mock.calls[0][1]
    expect(['groupId', 'place:e1', 'place:e2'].map((key) => form.get(key))).toEqual(['g1', '2', '1'])
  })
})

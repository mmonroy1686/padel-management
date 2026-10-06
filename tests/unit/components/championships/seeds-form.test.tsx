import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SeedsForm } from '@/components/championships/seeds-form'
import type { FormAction } from '@/components/ui/action-form'

const ok = async () => ({ status: 'ok' as const, message: 'Cabezas de serie guardadas.' })

describe('SeedsForm', () => {
  it('numbers the pairs the organizer picks as seeds', async () => {
    const action = vi.fn<FormAction>(ok)
    render(
      <SeedsForm
        categoryId="k1"
        pairs={[
          { id: 'e2', name: 'Bruno y Lucía', levels: 'Declaran 4ª y 4ª (suma 8)', seed: 1 },
          { id: 'e1', name: 'Ana y Pedro', levels: 'Declaran 5ª y 6ª (suma 11)', seed: null },
        ]}
        action={action}
      />,
    )
    expect(screen.getByLabelText('Cabeza de serie de Bruno y Lucía')).toHaveValue('1')
    await userEvent.selectOptions(screen.getByLabelText('Cabeza de serie de Ana y Pedro'), '2')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cabezas de serie' }))
    await waitFor(() => expect(action).toHaveBeenCalled())
    const form = vi.mocked(action).mock.calls[0][1]
    expect(form.get('categoryId')).toBe('k1')
    expect(form.get('seed:e2')).toBe('1')
    expect(form.get('seed:e1')).toBe('2')
  })
})

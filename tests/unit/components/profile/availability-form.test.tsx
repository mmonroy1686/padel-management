import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AvailabilityForm } from '@/components/profile/availability-form'
import { PreferredCourtsForm } from '@/components/profile/preferred-courts-form'
import type { FormAction } from '@/components/ui/action-form'

describe('AvailabilityForm', () => {
  it('shows days by band, Monday first, with the saved ones checked', () => {
    render(<AvailabilityForm action={vi.fn<FormAction>()} selected={['4-night']} />)
    expect(screen.getByRole('checkbox', { name: 'Jueves, noche' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Lunes, mañana' })).not.toBeChecked()
    expect(screen.getAllByRole('checkbox')).toHaveLength(21)
  })

  it('sends one key per checked box', async () => {
    const action = vi.fn<FormAction>(async () => ({ status: 'ok', message: '' }))
    render(<AvailabilityForm action={action} selected={['4-night']} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sábado, mañana' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar horarios' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect(action.mock.calls[0][1].getAll('availability')).toEqual(['4-night', '6-morning'])
  })
})

describe('PreferredCourtsForm', () => {
  it('sends the checked courts', async () => {
    const action = vi.fn<FormAction>(async () => ({ status: 'ok', message: '' }))
    render(
      <PreferredCourtsForm
        action={action}
        courts={[{ id: 'c1', name: 'Cancha 1' }, { id: 'c2', name: 'Cancha 2' }]}
        selected={['c2']}
      />,
    )
    await userEvent.click(screen.getByRole('checkbox', { name: 'Cancha 1' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar canchas' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect(action.mock.calls[0][1].getAll('courtIds')).toEqual(['c1', 'c2'])
  })
})

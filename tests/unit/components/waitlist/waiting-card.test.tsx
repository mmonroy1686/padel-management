import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { FormAction } from '@/components/ui/action-form'
import { WaitingCard } from '@/components/waitlist/waiting-card'

const done = async () => ({ status: 'ok' as const, message: 'Cancelaste la espera.' })

describe('WaitingCard', () => {
  it('lists each wait with a way to cancel it', async () => {
    const cancelAction = vi.fn<FormAction>(done)
    render(
      <WaitingCard
        waits={[
          { id: 'w1', text: 'sáb 3, de 18:30 a 21:30, cualquier cancha' },
          { id: 'w2', text: 'Mañana, de 08:00 a 12:30, Cancha 1' },
        ]}
        cancelAction={cancelAction}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Esperando turno' })).toBeInTheDocument()
    const items = within(screen.getByRole('list', { name: 'Tus esperas' })).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('sáb 3, de 18:30 a 21:30, cualquier cancha')
    await userEvent.click(within(items[1]).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(cancelAction).toHaveBeenCalledTimes(1))
    expect(cancelAction.mock.calls[0][1].get('waitId')).toBe('w2')
  })

  it('shows nothing without waits', () => {
    const { container } = render(<WaitingCard waits={[]} cancelAction={vi.fn<FormAction>()} />)
    expect(container).toBeEmptyDOMElement()
  })
})

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DeskCharge } from '@/components/club/desk-charge'
import type { FormAction } from '@/components/ui/action-form'

const ok = () => vi.fn<FormAction>(async () => ({ status: 'ok', message: 'Pago con POS registrado.' }))

describe('DeskCharge', () => {
  it('is the same single "Cobrar" when the club takes only cash', () => {
    render(<DeskCharge action={ok()} methods={['cash']} label="Cobrar $400" fields={{ entryId: 'e1', amount: 400 }} />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Cobrar $400' })).toBeInTheDocument()
  })

  it('offers cash and POS side by side, and sends the method picked', async () => {
    const action = ok()
    render(<DeskCharge action={action} methods={['cash', 'card']} label="Cobrar $400" fields={{ entryId: 'e1', amount: 400 }} />)
    expect(screen.getByRole('button', { name: 'Cobrar $400 en efectivo' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cobrar $400 con POS' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect(Object.fromEntries(action.mock.calls[0][1].entries())).toEqual({ entryId: 'e1', amount: '400', method: 'card' })
  })

  it('shows nothing when the club charges nothing at the desk', () => {
    const { container } = render(<DeskCharge action={ok()} methods={[]} label="Cobrar $400" fields={{}} />)
    expect(container).toBeEmptyDOMElement()
  })
})

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChargeChoice } from '@/components/club/charge-choice'
import type { FormAction } from '@/components/ui/action-form'
import type { ActionState } from '@/lib/actions/result'

function renderChoice(
  result: ActionState = { status: 'ok', message: 'Cobramos $300 en efectivo.' },
  methods = { cash: true, transfer: true },
) {
  const action = vi.fn<FormAction>(async () => result)
  const onDone = vi.fn()
  const onError = vi.fn()
  const onCancel = vi.fn()
  render(
    <ChargeChoice
      title="Cobrar $300 a Bruno"
      fields={{ bookingId: 'b1', position: '2' }}
      action={action}
      methods={methods}
      onDone={onDone}
      onError={onError}
      onCancel={onCancel}
    />,
  )
  return { action, onDone, onError, onCancel }
}

describe('ChargeChoice', () => {
  it('asks how the player paid and sends the method with the fields', async () => {
    const { action, onDone } = renderChoice()
    const group = screen.getByRole('group', { name: 'Cobrar $300 a Bruno' })
    expect(group).toHaveTextContent('Cobrar $300 a Bruno')
    await userEvent.click(screen.getByRole('button', { name: 'Efectivo' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('Cobramos $300 en efectivo.'))
    expect(Object.fromEntries(action.mock.calls[0][1].entries())).toEqual({
      bookingId: 'b1',
      position: '2',
      method: 'cash',
    })
  })

  it('sends a transfer reception confirms at the desk', async () => {
    const { action } = renderChoice()
    await userEvent.click(screen.getByRole('button', { name: 'Me transfirió' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect(action.mock.calls[0][1].get('method')).toBe('transfer')
  })

  it('offers only the methods the club takes', () => {
    renderChoice(undefined, { cash: false, transfer: true })
    expect(screen.queryByRole('button', { name: 'Efectivo' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Me transfirió' })).toBeInTheDocument()
  })

  it('passes an error up and can go back', async () => {
    const { onError, onDone, onCancel } = renderChoice({ status: 'error', message: 'Ya estaba pagado.' })
    await userEvent.click(screen.getByRole('button', { name: 'Efectivo' }))
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Ya estaba pagado.'))
    expect(onDone).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Volver' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChargeReceipt, UNDO_MS } from '@/components/club/charge-receipt'
import type { FormAction } from '@/components/ui/action-form'

describe('ChargeReceipt', () => {
  it('says what was charged and takes back every payment it made, in one call', async () => {
    const action = vi.fn<FormAction>(async () => ({ status: 'ok', message: 'Cobros anulados (2). Vuelven a figurar como deuda.' }))
    const onUndone = vi.fn()
    render(
      <ChargeReceipt
        message="Cobramos $2.000 en efectivo a Sofía."
        undo={{ paymentIds: ['p1', 'p2'], action, label: 'Deshacer el cobro a Sofía' }}
        onDismiss={vi.fn()}
        onUndone={onUndone}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Cobramos $2.000 en efectivo a Sofía.')
    await userEvent.click(screen.getByRole('button', { name: 'Deshacer el cobro a Sofía' }))
    await waitFor(() => expect(onUndone).toHaveBeenCalledWith('Cobros anulados (2). Vuelven a figurar como deuda.'))
    expect(action).toHaveBeenCalledTimes(1)
    expect(action.mock.calls[0][1].getAll('paymentId')).toEqual(['p1', 'p2'])
  })

  it('offers "Deshacer" for a while only, then goes away so it does not cover the list', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    try {
      render(
        <ChargeReceipt
          message="Cobramos $300 en efectivo."
          undo={{ paymentIds: ['p1'], action: vi.fn<FormAction>(), label: 'Deshacer el cobro' }}
          onDismiss={onDismiss}
          onUndone={vi.fn()}
        />,
      )
      expect(screen.getByRole('button', { name: 'Deshacer el cobro' })).toBeInTheDocument()
      act(() => vi.advanceTimersByTime(UNDO_MS))
      expect(screen.queryByRole('button', { name: 'Deshacer el cobro' })).not.toBeInTheDocument()
      expect(onDismiss).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a failed undo leaves the charge as it was, and says so', async () => {
    const action = vi.fn<FormAction>(async () => ({ status: 'error', message: 'Ese pago ya no se puede anular' }))
    const onUndone = vi.fn()
    render(<ChargeReceipt message="Cobramos $900." undo={{ paymentIds: ['p1', 'p2'], action, label: 'Deshacer el cobro' }} onDismiss={vi.fn()} onUndone={onUndone} />)
    await userEvent.click(screen.getByRole('button', { name: 'Deshacer el cobro' }))
    expect(await screen.findByText('No pudimos deshacer: Ese pago ya no se puede anular. El cobro sigue hecho.')).toBeInTheDocument()
    expect(onUndone).not.toHaveBeenCalled()
  })
})

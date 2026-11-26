import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChargeReceipt, UNDO_MS } from '@/components/club/charge-receipt'
import type { FormAction } from '@/components/ui/action-form'

describe('ChargeReceipt', () => {
  it('says what was charged and takes back every payment it made', async () => {
    const action = vi.fn<FormAction>(async () => ({ status: 'ok', message: 'Cobro anulado. Vuelve a figurar como deuda.' }))
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
    await waitFor(() => expect(onUndone).toHaveBeenCalledWith('Cobros anulados (2).'))
    expect(action.mock.calls.map((call) => call[1].get('paymentId'))).toEqual(['p1', 'p2'])
  })

  it('offers "Deshacer" for ten seconds only', () => {
    vi.useFakeTimers()
    try {
      render(
        <ChargeReceipt
          message="Cobramos $300 en efectivo."
          undo={{ paymentIds: ['p1'], action: vi.fn<FormAction>(), label: 'Deshacer el cobro' }}
          onDismiss={vi.fn()}
          onUndone={vi.fn()}
        />,
      )
      expect(screen.getByRole('button', { name: 'Deshacer el cobro' })).toBeInTheDocument()
      act(() => vi.advanceTimersByTime(UNDO_MS))
      expect(screen.queryByRole('button', { name: 'Deshacer el cobro' })).not.toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('Cobramos $300 en efectivo.')
    } finally {
      vi.useRealTimers()
    }
  })
})

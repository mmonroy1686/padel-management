import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TransferReviewCard, type TransferView } from '@/app/(club)/club/cobros/transfer-review-card'
import type { FormAction } from '@/components/ui/action-form'

const TRANSFER: TransferView = {
  id: 'p1',
  amount: 1600,
  holder: 'Martina',
  when: 'sábado 3 de octubre, 20:00',
  courtName: 'Cancha 2',
  receiptUrl: 'https://example.test/signed',
}

function renderCard(transfer: TransferView = TRANSFER) {
  const confirmAction = vi.fn<FormAction>(async () => ({ status: 'ok', message: 'Pago confirmado.' }))
  const rejectAction = vi.fn<FormAction>(async () => ({ status: 'ok', message: 'Transferencia rechazada.' }))
  render(<TransferReviewCard transfer={transfer} confirmAction={confirmAction} rejectAction={rejectAction} />)
  return { confirmAction, rejectAction }
}

describe('TransferReviewCard', () => {
  it('shows who, when, how much and the receipt', () => {
    renderCard()
    expect(screen.getByText('Martina')).toBeInTheDocument()
    expect(screen.getByText('sábado 3 de octubre, 20:00')).toBeInTheDocument()
    expect(screen.getByText('Cancha 2')).toBeInTheDocument()
    expect(screen.getByText('$1.600')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver comprobante' })).toHaveAttribute('href', 'https://example.test/signed')
  })

  it('confirms the payment', async () => {
    const { confirmAction } = renderCard()
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(confirmAction).toHaveBeenCalledTimes(1))
    expect(confirmAction.mock.calls[0][1].get('paymentId')).toBe('p1')
    expect(await screen.findByRole('status')).toHaveTextContent('Pago confirmado.')
  })

  it('asks for a reason before rejecting', async () => {
    const { rejectAction } = renderCard()
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar' }))
    await userEvent.type(screen.getByLabelText('Motivo'), 'No llegó')
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar transferencia' }))
    await waitFor(() => expect(rejectAction).toHaveBeenCalledTimes(1))
    expect(Object.fromEntries(rejectAction.mock.calls[0][1].entries())).toEqual({ paymentId: 'p1', reason: 'No llegó' })
  })
})

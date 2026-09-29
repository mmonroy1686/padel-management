import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PaymentBadge } from '@/components/booking/payment-badge'

describe('PaymentBadge', () => {
  it.each([
    ['paid', 'Pagada'],
    ['reported', 'Transferencia informada'],
    ['pending', 'Pendiente de pago'],
    ['refund_due', 'A devolver'],
  ] as const)('shows %s as "%s"', (state, label) => {
    render(<PaymentBadge state={state} />)
    expect(screen.getByText(label)).toHaveAttribute('data-state', state)
  })
})

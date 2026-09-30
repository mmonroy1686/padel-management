import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PassBoard, type PassBoardProps } from '@/app/(jugador)/day-use/pase/[id]/pass-board'
import type { ReportTransfer } from '@/components/booking/transfer-sheet'
import type { FormAction } from '@/components/ui/action-form'
import { at, TIMEZONE } from '../../fixtures/grid'
import { makePass } from '../../fixtures/day-use'

function renderBoard(overrides: Partial<PassBoardProps> = {}) {
  const props: PassBoardProps = {
    pass: makePass(),
    viewerId: 'ana',
    qrSvg: '<svg viewBox="0 0 10 10"></svg>',
    whenText: 'jueves 1 de octubre, 08:00 a 12:30',
    timezone: TIMEZONE,
    payment: { state: 'pending', due: 450, canReportTransfer: true, rejectionReason: null },
    paymentNote: 'Se paga en el club o por transferencia.',
    transfer: { details: 'Banco Ejemplo', receiptRequired: true },
    canCancel: true,
    cancelAction: vi.fn<FormAction>(),
    reportAction: vi.fn<ReportTransfer>(),
    ...overrides,
  }
  render(<PassBoard {...props} />)
}

describe('PassBoard', () => {
  it('shows the QR, the code, when, and what is owed', () => {
    renderBoard()
    expect(screen.getByRole('heading', { name: 'Day use completo' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Código QR del pase' }).querySelector('svg')).not.toBeNull()
    expect(screen.getByTestId('pass-code')).toHaveTextContent('DU-482193')
    expect(screen.getByText('jueves 1 de octubre, 08:00 a 12:30')).toBeInTheDocument()
    expect(screen.getByText('Comprado')).toBeInTheDocument()
    expect(screen.getByText('Pendiente de pago')).toBeInTheDocument()
  })

  it('lets the player report a transfer and cancel', async () => {
    renderBoard()
    await userEvent.click(screen.getByRole('button', { name: 'Ya transferí' }))
    expect(screen.getByRole('dialog', { name: 'Ya transferí' })).toHaveTextContent('Banco Ejemplo')
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar pase' }))
    expect(screen.getByRole('dialog', { name: 'Cancelar pase' })).toHaveTextContent('Tu lugar queda libre.')
  })

  it('says the entrance is registered once she is in', () => {
    renderBoard({ pass: makePass({ status: 'inside', checkedInAt: at('10:12') }), canCancel: false })
    expect(screen.getByRole('note')).toHaveTextContent('Ya registraste el ingreso a las 10:12. ¡Que lo disfrutes!')
    expect(screen.queryByRole('button', { name: 'Cancelar pase' })).not.toBeInTheDocument()
  })

  it('has nothing to pay with a full reward', () => {
    renderBoard({
      pass: makePass({ usedReward: true, discountPercent: 100, total: 0 }),
      payment: { state: 'paid', due: 0, canReportTransfer: false, rejectionReason: null },
    })
    expect(screen.getByText('Sin costo: usaste tu recompensa.')).toBeInTheDocument()
    expect(screen.getByText('$0 (-100% con tu recompensa)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ya transferí' })).not.toBeInTheDocument()
  })

  it('hides the QR of a cancelled pass', () => {
    renderBoard({ pass: makePass({ status: 'cancelled' }), canCancel: false })
    expect(screen.queryByRole('img', { name: 'Código QR del pase' })).not.toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('Este pase está cancelado.')
  })
})

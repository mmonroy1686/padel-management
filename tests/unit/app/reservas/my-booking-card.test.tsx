import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MyBookingCard } from '@/app/(jugador)/reservas/my-booking-card'
import type { ReportTransfer } from '@/components/booking/transfer-sheet'
import type { FormAction } from '@/components/ui/action-form'
import type { MyBookingView } from '@/lib/domain/my-bookings'

const BOOKING: MyBookingView = {
  id: 'b1',
  dateText: 'sábado 3 de octubre',
  timeText: '20:00 a 21:30',
  courtName: 'Cancha 2',
  price: 1600,
  upcoming: true,
  cancelled: false,
  paymentState: 'pending',
  amountDue: 1600,
  cancel: { allowed: true },
  canReportTransfer: true,
  rejectionReason: null,
}

function renderCard(booking: MyBookingView = BOOKING) {
  render(
    <MyBookingCard
      booking={booking}
      userId="u1"
      transfer={{ details: 'Banco Ejemplo', receiptRequired: true }}
      cancelAction={vi.fn<FormAction>()}
      reportAction={vi.fn<ReportTransfer>()}
    />,
  )
}

describe('MyBookingCard', () => {
  it('shows when, where, how much and the payment state', () => {
    renderCard()
    expect(screen.getByText('sábado 3 de octubre')).toBeInTheDocument()
    expect(screen.getByText(/20:00 a 21:30, Cancha 2/)).toBeInTheDocument()
    expect(screen.getByText('Pendiente de pago')).toBeInTheDocument()
  })

  it('asks before cancelling', async () => {
    renderCard()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar reserva' }))
    expect(screen.getByRole('dialog', { name: 'Cancelar reserva' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sí, cancelar' })).toBeInTheDocument()
  })

  it('explains why it can no longer be cancelled', () => {
    renderCard({ ...BOOKING, cancel: { allowed: false, reason: 'Ya no se puede cancelar: faltan menos de 24 h. Avisá al club.' } })
    expect(screen.queryByRole('button', { name: 'Cancelar reserva' })).not.toBeInTheDocument()
    expect(screen.getByText(/faltan menos de 24 h/)).toBeInTheDocument()
  })

  it('opens the transfer sheet', async () => {
    renderCard()
    await userEvent.click(screen.getByRole('button', { name: 'Ya transferí' }))
    expect(screen.getByRole('dialog', { name: 'Ya transferí' })).toHaveTextContent('Banco Ejemplo')
  })

  it('links a match share to its match instead of cancelling', () => {
    renderCard({ ...BOOKING, matchId: 'm1', cancel: { allowed: false, reason: 'Para bajarte, entrá al partido.' } })
    expect(screen.getByText('Partido abierto, tu parte')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver partido' })).toHaveAttribute('href', '/partidos/m1')
    expect(screen.queryByRole('button', { name: 'Cancelar reserva' })).not.toBeInTheDocument()
  })
})

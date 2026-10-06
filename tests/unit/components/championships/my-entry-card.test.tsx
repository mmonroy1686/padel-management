import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MyEntryCard, type MyEntryView } from '@/components/championships/my-entry-card'

const VIEW: MyEntryView = {
  entryId: 'e1',
  categoryName: '6ta Libre',
  partnerName: 'Pedro',
  stateText: 'Con lugar',
  waiting: false,
  payment: { state: 'pending', due: 2000, canReportTransfer: true, rejectionReason: null },
  hoursText: 'No pueden en 1 franja.',
  canWithdraw: true,
  canEditHours: true,
}

describe('MyEntryCard', () => {
  it('shows the pair, its place, its payment and what can be done', async () => {
    const onPay = vi.fn()
    const onHours = vi.fn()
    const onLeave = vi.fn()
    render(<MyEntryCard view={VIEW} onPay={onPay} onHours={onHours} onLeave={onLeave} />)
    expect(screen.getByText('6ta Libre')).toBeInTheDocument()
    expect(screen.getByText('Con Pedro')).toBeInTheDocument()
    expect(screen.getByText('Con lugar')).toBeInTheDocument()
    expect(screen.getByText('Pendiente de pago')).toBeInTheDocument()
    expect(screen.getByText('No pueden en 1 franja.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ya transferí' }))
    await userEvent.click(screen.getByRole('button', { name: 'Horarios imposibles' }))
    await userEvent.click(screen.getByRole('button', { name: 'Darme de baja' }))
    expect(onPay).toHaveBeenCalled()
    expect(onHours).toHaveBeenCalled()
    expect(onLeave).toHaveBeenCalled()
  })

  it('tells a waiting pair it pays once it gets in, and hides what is closed', () => {
    render(
      <MyEntryCard
        view={{ ...VIEW, stateText: 'En espera, puesto 2', waiting: true, payment: null, canWithdraw: false, canEditHours: false }}
        onPay={vi.fn()} onHours={vi.fn()} onLeave={vi.fn()}
      />,
    )
    expect(screen.getByText('En espera, puesto 2')).toBeInTheDocument()
    expect(screen.getByText('Pagan cuando entren: si se libera un lugar, entran solos y te avisamos.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('says why a transfer was rejected', () => {
    render(
      <MyEntryCard
        view={{ ...VIEW, payment: { state: 'pending', due: 2000, canReportTransfer: true, rejectionReason: 'no llegó' } }}
        onPay={vi.fn()} onHours={vi.fn()} onLeave={vi.fn()}
      />,
    )
    expect(screen.getByText('El club rechazó la transferencia: no llegó.')).toBeInTheDocument()
  })
})

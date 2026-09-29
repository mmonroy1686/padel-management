import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BookingSheet, type BookingChoice } from '@/components/booking/booking-sheet'
import type { FormAction } from '@/components/ui/action-form'

const CHOICE: BookingChoice = {
  courtId: 'court-1',
  courtName: 'Cancha 1',
  startsAt: '2026-10-01T23:00:00.000Z',
  timeLabel: '20:00',
  price: 1600,
}

function renderSheet(action: FormAction, choice: BookingChoice | null = CHOICE) {
  const onBooked = vi.fn()
  render(
    <BookingSheet
      choice={choice}
      dayText="jueves 1 de octubre"
      paymentNote="Se paga en el club o por transferencia."
      cancellationRule="Podés cancelar desde la app hasta 24 h antes. Después, avisá al club."
      action={action}
      onClose={vi.fn()}
      onBooked={onBooked}
    />,
  )
  return { onBooked }
}

describe('BookingSheet', () => {
  it('explains court, time, price, how to pay and the cancellation rule', () => {
    renderSheet(vi.fn<FormAction>())
    const dialog = screen.getByRole('dialog', { name: 'Reservar cancha' })
    expect(dialog).toHaveTextContent('Cancha 1')
    expect(dialog).toHaveTextContent('jueves 1 de octubre, 20:00')
    expect(dialog).toHaveTextContent('$1.600')
    expect(dialog).toHaveTextContent('Se paga en el club o por transferencia.')
    expect(dialog).toHaveTextContent('24 h antes')
  })

  it('books the chosen court and time', async () => {
    const action = vi.fn<FormAction>(async () => ({ status: 'ok', message: 'Listo' }))
    const { onBooked } = renderSheet(action)
    await userEvent.click(screen.getByRole('button', { name: 'Reservar' }))
    await waitFor(() => expect(onBooked).toHaveBeenCalledWith('Listo'))
    const form = action.mock.calls[0][1]
    expect(form.get('courtId')).toBe('court-1')
    expect(form.get('startsAt')).toBe(CHOICE.startsAt)
  })

  it('stays open with the reason when the court was just taken', async () => {
    const action = vi.fn<FormAction>(async () => ({ status: 'error', message: 'Esa cancha se acaba de ocupar. Elegí otro horario.' }))
    const { onBooked } = renderSheet(action)
    await userEvent.click(screen.getByRole('button', { name: 'Reservar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Esa cancha se acaba de ocupar')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(onBooked).not.toHaveBeenCalled()
  })

  it('renders nothing without a choice', () => {
    renderSheet(vi.fn<FormAction>(), null)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

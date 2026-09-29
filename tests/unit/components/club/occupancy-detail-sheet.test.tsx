import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { OccupancyDetailSheet, type DetailActions } from '@/components/club/occupancy-detail-sheet'
import type { FormAction } from '@/components/ui/action-form'
import type { GridCell } from '@/lib/domain/grid'
import { booking, makeGrid, occupancy, TIMEZONE } from '../../fixtures/grid'

const booked = makeGrid({
  occupancies: [occupancy('o1', 'court-1', '08:00', '09:30')],
  bookings: [booking('o1', { holderName: 'Rodríguez', amountDue: 1200 })],
}).rows[0].cells[0]
const blocked = makeGrid({
  occupancies: [occupancy('blk', 'court-2', '08:00', '11:00', 'block', 'Clase de Pablo')],
}).rows[0].cells[1]

function renderDetail(cell: GridCell, acceptsCash = true) {
  const done = async () => ({ status: 'ok' as const, message: 'Listo.' })
  const actions: DetailActions = {
    cancel: vi.fn<FormAction>(done),
    unblock: vi.fn<FormAction>(done),
    cash: vi.fn<FormAction>(done),
  }
  const onDone = vi.fn()
  render(
    <OccupancyDetailSheet
      cell={cell}
      occupancy={cell.occupancy!}
      dayText="jueves 1 de octubre"
      timezone={TIMEZONE}
      acceptsCash={acceptsCash}
      actions={actions}
      onClose={vi.fn()}
      onDone={onDone}
    />,
  )
  const sent = (action: FormAction) => Object.fromEntries(vi.mocked(action).mock.calls[0][1].entries())
  return { actions, onDone, sent }
}

describe('OccupancyDetailSheet', () => {
  it('shows holder, time, source and payment', () => {
    renderDetail(booked)
    const dialog = screen.getByRole('dialog', { name: 'Rodríguez' })
    expect(dialog).toHaveTextContent('Reserva, Cancha 1, jueves 1 de octubre, 08:00 a 09:30, cargada en recepción')
    expect(dialog).toHaveTextContent('Pendiente de pago')
    expect(dialog).toHaveTextContent('$1.200')
  })

  it('records cash for what is due', async () => {
    const { actions, sent } = renderDetail(booked)
    expect(screen.getByLabelText('Monto')).toHaveValue(1200)
    await userEvent.click(screen.getByRole('button', { name: 'Cobrar en efectivo' }))
    await waitFor(() => expect(actions.cash).toHaveBeenCalledTimes(1))
    expect(sent(actions.cash)).toEqual({ bookingId: 'b-o1', amount: '1200' })
  })

  it('cancels the booking', async () => {
    const { actions, onDone, sent } = renderDetail(booked)
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar reserva' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('Listo.'))
    expect(sent(actions.cancel)).toEqual({ bookingId: 'b-o1' })
  })

  it('hides cash when the club does not take it', () => {
    renderDetail(booked, false)
    expect(screen.queryByRole('button', { name: 'Cobrar en efectivo' })).not.toBeInTheDocument()
  })

  it('frees a blocked court', async () => {
    const { actions, sent } = renderDetail(blocked)
    expect(screen.getByRole('dialog', { name: 'Clase de Pablo' })).toHaveTextContent('08:00 a 11:00')
    expect(screen.queryByRole('button', { name: 'Cancelar reserva' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Liberar cancha' }))
    await waitFor(() => expect(actions.unblock).toHaveBeenCalledTimes(1))
    expect(sent(actions.unblock)).toEqual({ occupancyId: 'blk' })
  })
})

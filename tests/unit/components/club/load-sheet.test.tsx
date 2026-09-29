import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LoadSheet } from '@/components/club/load-sheet'
import type { FormAction } from '@/components/ui/action-form'
import { at, DATE, makeGrid } from '../../fixtures/grid'

const grid = makeGrid()
const cell = grid.rows[0].cells[0]
const MEMBERS = [{ userId: 'u-ana', name: 'Ana' }]

function renderSheet() {
  const action = vi.fn<FormAction>(async () => ({ status: 'ok', message: 'Reserva cargada.' }))
  const onDone = vi.fn()
  render(
    <LoadSheet
      cell={cell}
      date={DATE}
      dayText="jueves 1 de octubre"
      rows={grid.rows}
      members={MEMBERS}
      action={action}
      onClose={vi.fn()}
      onDone={onDone}
    />,
  )
  const sent = () => Object.fromEntries(action.mock.calls[0][1].entries())
  return { action, onDone, sent }
}

describe('LoadSheet', () => {
  it('says which court and time it is loading', () => {
    renderSheet()
    expect(screen.getByRole('dialog', { name: 'Cargar turno' })).toHaveTextContent('Cancha 1, jueves 1 de octubre, 08:00. $1.200')
  })

  it('loads a booking under a name by default', async () => {
    const { action, onDone, sent } = renderSheet()
    await userEvent.type(screen.getByLabelText('A nombre de', { exact: true }), 'Rodríguez')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('Reserva cargada.'))
    expect(action).toHaveBeenCalledTimes(1)
    expect(sent()).toMatchObject({
      kind: 'booking',
      holder: 'guest',
      guestName: 'Rodríguez',
      courtId: 'court-1',
      startsAt: cell.slot.startsAt.toISOString(),
    })
  })

  it('loads a booking for a club member', async () => {
    const { action, sent } = renderSheet()
    await userEvent.click(screen.getByRole('radio', { name: 'Jugador del club' }))
    await userEvent.selectOptions(screen.getByLabelText('Jugador', { exact: true }), 'Ana')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect(sent()).toMatchObject({ kind: 'booking', holder: 'player', playerId: 'u-ana' })
  })

  it('loads a recurring slot, optionally with an end date', async () => {
    const { action, sent } = renderSheet()
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'Turno fijo')
    await userEvent.type(screen.getByLabelText('A nombre de', { exact: true }), 'Rodríguez')
    // jsdom does not type into input[type=date] like a browser does.
    fireEvent.change(screen.getByLabelText('Hasta (opcional)'), { target: { value: '2026-12-31' } })
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect(sent()).toMatchObject({
      kind: 'series',
      guestName: 'Rodríguez',
      date: DATE,
      startTime: '08:00',
      endsOn: '2026-12-31',
    })
  })

  it('blocks the court until the chosen time, with a reason', async () => {
    const { action, sent } = renderSheet()
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'Bloqueo')
    const until = screen.getByLabelText('Hasta')
    expect([...(until as HTMLSelectElement).options].map((option) => option.textContent)).toEqual([
      '09:30', '11:00', '12:30', '14:00', '15:30', '17:00', '18:30', '20:00', '21:30', '23:00',
    ])
    await userEvent.selectOptions(until, '11:00')
    await userEvent.type(screen.getByLabelText('Motivo'), 'Clase de Pablo')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect(sent()).toMatchObject({ kind: 'block', endsAt: at('11:00').toISOString(), note: 'Clase de Pablo' })
  })
})

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { OccupancyDetailSheet, type DetailActions } from '@/components/club/occupancy-detail-sheet'
import type { FormAction } from '@/components/ui/action-form'
import { turnPlayers } from '@/lib/domain/club-home'
import type { GridCell } from '@/lib/domain/grid'
import { at, booking, makeGrid, occupancy, TIMEZONE } from '../../fixtures/grid'

const bookingTurn = turnPlayers({
  id: 'b-o1',
  price: 1200,
  player_id: null,
  guest_name: 'Rodríguez',
  match_id: null,
  player: null,
  match: null,
  players: [],
  payments: [],
})
const matchTurn = turnPlayers({
  id: 'b-om',
  price: 1600,
  player_id: null,
  guest_name: null,
  match_id: 'm1',
  player: null,
  match: {
    slots: [
      { position: 1, player_id: 'a', player: { display_name: 'Ana' } },
      { position: 2, player_id: 'b', player: { display_name: 'Bruno' } },
    ],
  },
  players: [],
  payments: [{ status: 'confirmed', amount: 400, payer_id: 'a', payer_position: null }],
})

const booked = makeGrid({
  occupancies: [occupancy('o1', 'court-1', '08:00', '09:30')],
  bookings: [booking('o1', { holderName: 'Rodríguez', amountDue: 1200, turn: bookingTurn })],
}).rows[0].cells[0]
const blocked = makeGrid({
  occupancies: [occupancy('blk', 'court-2', '08:00', '11:00', 'block', 'Clase de Pablo')],
}).rows[0].cells[1]
const matchCell = makeGrid({
  occupancies: [occupancy('om', 'court-1', '20:00', '21:30', 'match')],
  bookings: [
    booking('om', {
      holderName: 'Partido abierto',
      source: 'online',
      price: 1600,
      amountDue: 1200,
      matchId: 'm1',
      turn: matchTurn,
    }),
  ],
}).rows.find((row) => row.slot.label === '20:00')!.cells[0]

const held = makeGrid({
  occupancies: [{ ...occupancy('h1', 'court-1', '20:00', '21:30', 'hold', 'Ana'), expiresAt: at('17:42') }],
}).rows.find((row) => row.slot.label === '20:00')!.cells[0]

function renderDetail(cell: GridCell, methods = { cash: true, transfer: true }) {
  const done = async () => ({ status: 'ok' as const, message: 'Listo.' })
  const actions: DetailActions = {
    cancel: vi.fn<FormAction>(done),
    unblock: vi.fn<FormAction>(done),
    chargeShare: vi.fn<FormAction>(done),
    chargeRest: vi.fn<FormAction>(done),
    savePlayers: vi.fn<FormAction>(done),
    endSeries: vi.fn<FormAction>(done),
    cancelMatch: vi.fn<FormAction>(done),
    removeFromMatch: vi.fn<FormAction>(done),
    release: vi.fn<FormAction>(done),
  }
  const onDone = vi.fn()
  render(
    <OccupancyDetailSheet
      cell={cell}
      occupancy={cell.occupancy!}
      date="2026-10-01"
      dayText="jueves 1 de octubre"
      timezone={TIMEZONE}
      methods={methods}
      members={[{ userId: 'u2', name: 'Bruno Díaz' }]}
      actions={actions}
      onClose={vi.fn()}
      onDone={onDone}
    />,
  )
  const sent = (action: FormAction) => Object.fromEntries(vi.mocked(action).mock.calls[0][1].entries())
  return { actions, onDone, sent }
}

describe('OccupancyDetailSheet', () => {
  it('links a tournament block to its page', () => {
    const tournamentCell = makeGrid({
      occupancies: [{ ...occupancy('tt', 'court-1', '18:00', '20:20', 'tournament', 'Americano de octubre'), tournamentId: 't1' }],
    }).rows.find((row) => row.slot.label === '18:30')!.cells[0]
    renderDetail(tournamentCell)
    expect(screen.getByRole('dialog', { name: 'Americano de octubre' })).toHaveTextContent('Torneo, Cancha 1')
    expect(screen.getByRole('link', { name: 'Gestionar torneo' })).toHaveAttribute('href', '/club/torneos/t1')
    expect(screen.queryByRole('button', { name: 'Liberar cancha' })).not.toBeInTheDocument()
  })

  it('shows holder, time, source and payment', () => {
    renderDetail(booked)
    const dialog = screen.getByRole('dialog', { name: 'Rodríguez' })
    expect(dialog).toHaveTextContent('Reserva, Cancha 1, jueves 1 de octubre, 08:00 a 09:30, cargada en recepción')
    expect(dialog).toHaveTextContent('Pendiente de pago')
    expect(dialog).toHaveTextContent('$1.200')
  })

  it('charges a player his share with the same block as the Inicio, and closes on success', async () => {
    const { actions, onDone, sent } = renderDetail(booked)
    expect(screen.getByRole('list', { name: 'Jugadores' })).toHaveTextContent('Jugador 2')
    await userEvent.click(screen.getByRole('button', { name: 'Cobrar $300 a Jugador 2' }))
    const choice = screen.getByRole('group', { name: 'Cobrar $300 a Jugador 2' })
    await userEvent.click(within(choice).getByRole('button', { name: 'Efectivo' }))
    await waitFor(() => expect(actions.chargeShare).toHaveBeenCalledTimes(1))
    expect(sent(actions.chargeShare)).toEqual({ bookingId: 'b-o1', position: '2', method: 'cash' })
    expect(onDone).toHaveBeenCalledWith('Listo.')
  })

  it('charges everything left', async () => {
    const { actions, sent } = renderDetail(booked)
    await userEvent.click(screen.getByRole('button', { name: 'Cobrar todo lo que falta ($1.200)' }))
    await userEvent.click(screen.getByRole('button', { name: 'Me transfirió' }))
    await waitFor(() => expect(actions.chargeRest).toHaveBeenCalledTimes(1))
    expect(sent(actions.chargeRest)).toEqual({ bookingId: 'b-o1', method: 'transfer' })
  })

  it('hides charges when the club takes neither method', () => {
    renderDetail(booked, { cash: false, transfer: false })
    expect(screen.queryByRole('button', { name: /^Cobrar/ })).not.toBeInTheDocument()
  })

  it('cancels the booking', async () => {
    const { actions, onDone, sent } = renderDetail(booked)
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar reserva' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('Listo.'))
    expect(sent(actions.cancel)).toEqual({ bookingId: 'b-o1' })
  })

  it('ends a recurring slot from this date on', async () => {
    const recurring = makeGrid({
      occupancies: [occupancy('r1', 'court-1', '08:00', '09:30', 'recurring')],
      bookings: [booking('r1', { holderName: 'Rodríguez', seriesId: 's1' })],
    }).rows[0].cells[0]
    const { actions, sent } = renderDetail(recurring)
    await userEvent.click(screen.getByRole('button', { name: 'Terminar turno fijo desde esta fecha' }))
    await waitFor(() => expect(actions.endSeries).toHaveBeenCalledTimes(1))
    expect(sent(actions.endSeries)).toEqual({ seriesId: 's1', fromDate: '2026-10-01' })
  })

  it('frees a blocked court', async () => {
    const { actions, sent } = renderDetail(blocked)
    expect(screen.getByRole('dialog', { name: 'Clase de Pablo' })).toHaveTextContent('08:00 a 11:00')
    expect(screen.queryByRole('button', { name: 'Cancelar reserva' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Liberar cancha' }))
    await waitFor(() => expect(actions.unblock).toHaveBeenCalledTimes(1))
    expect(sent(actions.unblock)).toEqual({ occupancyId: 'blk' })
  })

  it('shows a match by player, with the same charges, taking a player out and cancelling it', async () => {
    const { actions, sent } = renderDetail(matchCell)
    const players = screen.getByRole('list', { name: 'Jugadores' })
    expect(players).toHaveTextContent('AnaPagó')
    expect(screen.queryByRole('button', { name: 'Completar jugadores' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cobrar $400 a Bruno' }))
    await userEvent.click(screen.getByRole('button', { name: 'Me transfirió' }))
    await waitFor(() => expect(actions.chargeShare).toHaveBeenCalledTimes(1))
    expect(sent(actions.chargeShare)).toEqual({ bookingId: 'b-om', position: '2', method: 'transfer' })
    expect(screen.getAllByRole('button', { name: 'Sacar del partido' })).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Cancelar partido' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancelar reserva' })).not.toBeInTheDocument()
  })

  it('says for whom a court is held and passes it to the next in line', async () => {
    const { actions, onDone, sent } = renderDetail(held)
    expect(screen.getByRole('dialog', { name: 'Ana' })).toHaveTextContent('Retenido para Ana hasta las 17:42.')
    await userEvent.click(screen.getByRole('button', { name: 'Pasar al siguiente' }))
    await waitFor(() => expect(actions.release).toHaveBeenCalledTimes(1))
    expect(sent(actions.release)).toEqual({ occupancyId: 'h1' })
    expect(onDone).toHaveBeenCalledWith('Listo.')
  })
})

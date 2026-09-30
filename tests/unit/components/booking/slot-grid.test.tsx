import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SlotGrid } from '@/components/booking/slot-grid'
import { at, booking, COURTS, makeGrid, occupancy } from '../../fixtures/grid'
import { makeMatch } from '../../fixtures/matches'

describe('SlotGrid for players', () => {
  it('offers free slots with court, time and price', async () => {
    const grid = makeGrid()
    const onSelect = vi.fn()
    render(<SlotGrid courts={COURTS} rows={grid.rows} variant="player" onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: 'Reservar Cancha 1 a las 08:00, $1.200' }))
    expect(onSelect).toHaveBeenCalledWith(grid.rows[0].cells[0])
  })

  it('shows taken, own and past slots without a button', () => {
    const grid = makeGrid({
      now: at('09:00'),
      occupancies: [occupancy('o1', 'court-1', '09:30', '11:00'), occupancy('o2', 'court-2', '09:30', '11:00')],
      bookings: [booking('o2', { isMine: true })],
    })
    render(<SlotGrid courts={COURTS} rows={grid.rows} variant="player" onSelect={vi.fn()} />)
    expect(screen.getAllByText('Ya pasó')).toHaveLength(2)
    expect(screen.getByText('Ocupada')).toBeInTheDocument()
    expect(screen.getByText('Tuya')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /09:30/ })).not.toBeInTheDocument()
  })

  it('names each court and whether it is covered', () => {
    render(<SlotGrid courts={COURTS} rows={makeGrid().rows} variant="player" onSelect={vi.fn()} />)
    expect(screen.getByRole('columnheader', { name: /Cancha 1/ })).toHaveTextContent('Techada')
    expect(screen.getByRole('columnheader', { name: /Cancha 2/ })).toHaveTextContent('Al aire libre')
  })
})

describe('SlotGrid for the club', () => {
  it('shows who holds each court and how it is paid', async () => {
    const grid = makeGrid({
      occupancies: [occupancy('o1', 'court-1', '08:00', '09:30')],
      bookings: [booking('o1', { holderName: 'Rodríguez', paymentState: 'reported' })],
    })
    const onSelect = vi.fn()
    render(<SlotGrid courts={COURTS} rows={grid.rows} variant="club" onSelect={onSelect} />)
    const cell = screen.getByRole('button', { name: 'Cancha 1, 08:00: Rodríguez' })
    expect(cell).toHaveTextContent('Reserva, en recepción')
    expect(cell).toHaveTextContent('Transferencia informada')
    await userEvent.click(cell)
    expect(onSelect).toHaveBeenCalledWith(grid.rows[0].cells[0])
  })

  it('labels blocks with their reason', () => {
    const grid = makeGrid({ occupancies: [occupancy('blk', 'court-2', '08:00', '09:30', 'block', 'Clase de Pablo')] })
    render(<SlotGrid courts={COURTS} rows={grid.rows} variant="club" onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Cancha 2, 08:00: Clase de Pablo' })).toHaveTextContent('Bloqueo')
  })

  it('lets reception load a free slot, and warns when it has no price', () => {
    render(<SlotGrid courts={COURTS} rows={makeGrid({ rules: [] }).rows} variant="club" onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Cargar Cancha 1, 08:00' })).toHaveTextContent('Sin precio')
  })
})

describe('open matches on the grid', () => {
  it('shows a forming match on the player grid and opens it', () => {
    const grid = makeGrid({ matches: [makeMatch()] })
    render(<SlotGrid courts={grid.courts} rows={grid.rows} variant="player" onSelect={vi.fn()} />)
    const link = screen.getByRole('link', { name: 'Partido armándose en Cancha 1 a las 20:00: faltan 3' })
    expect(link).toHaveAttribute('href', '/partidos/m1')
    expect(link).toHaveTextContent('Faltan 3')
  })

  it('tells reception the match does not block the court', () => {
    const grid = makeGrid({ matches: [makeMatch()] })
    render(<SlotGrid courts={grid.courts} rows={grid.rows} variant="club" onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Cargar Cancha 1, 20:00' })).toHaveTextContent('Armándose 1/4 · no bloquea')
  })
})

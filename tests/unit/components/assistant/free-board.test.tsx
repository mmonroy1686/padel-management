import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FreeBoard } from '@/components/assistant/free-board'
import type { AssistantBoard } from '@/lib/domain/assistant-board'
import { boardSlot, strongRows } from '../../fixtures/assistant'

const hot = boardSlot('court-1', '16:00', strongRows(8))
const quiet = boardSlot('court-2', '17:30', [])
const BOARD: AssistantBoard = {
  courts: [
    { id: 'court-1', name: 'Cancha 1' },
    { id: 'court-2', name: 'Cancha 2' },
  ],
  rows: [
    { label: '16:00', cells: [{ state: 'free', slot: hot }, { state: 'taken' }] },
    { label: '17:30', cells: [{ state: 'forming', matchId: 'm1', filled: 2 }, { state: 'free', slot: quiet }] },
    { label: '19:00', cells: [{ state: 'free', slot: null }, { state: 'none' }] },
  ],
}

describe('FreeBoard', () => {
  it('shows the demand on a free slot and opens it', async () => {
    const onPick = vi.fn()
    render(<FreeBoard board={BOARD} closeMinutes={30} onPick={onPick} />)
    await userEvent.click(screen.getByRole('button', { name: 'Armar partido · Cancha 1 · 16:00 · 🔥 8 posibles' }))
    expect(onPick).toHaveBeenCalledWith(hot)
    expect(screen.getByRole('button', { name: 'Armar partido · Cancha 2 · 17:30' })).toBeInTheDocument()
  })

  it('says a taken slot with words, not only with a strike', () => {
    render(<FreeBoard board={BOARD} closeMinutes={30} onPick={vi.fn()} />)
    const court2 = screen.getByRole('region', { name: 'Cancha 2' })
    expect(within(court2).getByText('16:00', { selector: 's' })).toBeInTheDocument()
    expect(within(court2).getByText('Ocupado')).toBeInTheDocument()
  })

  it('links a forming match and does not offer a slot past the match closing time', () => {
    render(<FreeBoard board={BOARD} closeMinutes={30} onPick={vi.fn()} />)
    expect(screen.getByRole('link', { name: '17:30 · Armándose 2/4' })).toHaveAttribute('href', '/partidos/m1')
    expect(within(screen.getByRole('region', { name: 'Cancha 1' })).getByText('19:00')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /19:00/ })).not.toBeInTheDocument()
    // Why, with the club's own closing time.
    expect(within(screen.getByRole('region', { name: 'Cancha 1' })).getByText('Cierra 30 min antes')).toBeInTheDocument()
  })

  it('says when nothing is free', () => {
    render(<FreeBoard board={{ courts: BOARD.courts, rows: [{ label: '16:00', cells: [{ state: 'taken' }, { state: 'taken' }] }] }} closeMinutes={30} onPick={vi.fn()} />)
    expect(screen.getByText('No quedan turnos libres este día.')).toBeInTheDocument()
  })
})

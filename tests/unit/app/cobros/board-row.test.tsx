import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BoardRow } from '@/app/(club)/club/cobros/board-row'
import type { BoardItem } from '@/lib/domain/payments-board'

const ITEM: BoardItem = {
  id: 'b1-',
  kind: 'booking',
  holder: 'Ana López',
  what: 'Cancha 1',
  when: 'jueves 1 de octubre, 20:00',
  at: 1,
  amount: 1600,
}

describe('BoardRow', () => {
  it('shows who and how much on one line, the kind, what and when below, with its button', () => {
    render(
      <BoardRow item={ITEM}>
        <button type="button">Cobrar</button>
      </BoardRow>,
    )
    const row = screen.getByRole('article', { name: 'Ana López' })
    expect(row).toHaveTextContent('$1.600')
    expect(row).toHaveTextContent('Reserva · Cancha 1 · jueves 1 de octubre, 20:00')
    expect(screen.getByRole('button', { name: 'Cobrar' })).toBeInTheDocument()
  })

  it('says how and when a done payment came in', () => {
    render(<BoardRow item={{ ...ITEM, when: '', done: { method: 'transfer', time: '18:40' } }} />)
    const row = screen.getByRole('article', { name: 'Ana López' })
    expect(row).toHaveTextContent('Reserva · Cancha 1')
    expect(row).toHaveTextContent('Transferencia · 18:40')
  })

  it('says why and when a transfer was rejected', () => {
    render(<BoardRow item={{ ...ITEM, done: { method: 'transfer', time: '16:00', rejection: 'No llegó la plata' } }} />)
    expect(screen.getByRole('article', { name: 'Ana López' })).toHaveTextContent('Rechazada · 16:00 · No llegó la plata')
  })
})

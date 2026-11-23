import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BoardCard } from '@/app/(club)/club/cobros/board-card'
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

describe('BoardCard', () => {
  it('shows who, what, when and how much, with its button', () => {
    render(
      <BoardCard item={ITEM}>
        <button type="button">Cobrar en efectivo</button>
      </BoardCard>,
    )
    const card = screen.getByRole('article', { name: 'Ana López' })
    expect(card).toHaveTextContent('Reserva')
    expect(card).toHaveTextContent('Cancha 1')
    expect(card).toHaveTextContent('jueves 1 de octubre, 20:00')
    expect(card).toHaveTextContent('$1.600')
    expect(screen.getByRole('button', { name: 'Cobrar en efectivo' })).toBeInTheDocument()
  })

  it('says how and when a done payment came in', () => {
    render(<BoardCard item={{ ...ITEM, when: '', done: { method: 'transfer', time: '18:40' } }} />)
    expect(screen.getByRole('article', { name: 'Ana López' })).toHaveTextContent('Transferencia · 18:40')
  })
})

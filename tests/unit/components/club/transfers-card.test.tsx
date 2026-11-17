import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TransfersCard } from '@/components/club/transfers-card'

describe('TransfersCard', () => {
  it('says how many transfers wait, their money and age, and goes to Cobros to review them', () => {
    render(
      <TransfersCard
        summary={{ count: 11, total: 13800, text: '11 transferencias por confirmar · $13.800', age: 'la más vieja hace 2 h' }}
      />,
    )
    const card = screen.getByRole('region', { name: 'Transferencias por confirmar' })
    expect(card).toHaveTextContent('11 transferencias por confirmar · $13.800')
    expect(card).toHaveTextContent('la más vieja hace 2 h')
    expect(screen.getByRole('link', { name: 'Revisar →' })).toHaveAttribute('href', '/club/cobros#transferencias')
  })
})

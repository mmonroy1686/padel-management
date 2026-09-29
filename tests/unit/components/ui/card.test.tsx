import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Card } from '@/components/ui/card'

describe('Card', () => {
  it('renders its content on the surface color', () => {
    render(<Card>Cancha 1</Card>)
    expect(screen.getByText('Cancha 1')).toHaveClass('bg-surface', 'rounded-2xl', 'p-4')
  })

  it('lets callers override padding and pass props through', () => {
    render(<Card className="p-6" data-testid="card">Cancha 1</Card>)
    const card = screen.getByTestId('card')
    expect(card).toHaveClass('p-6')
    expect(card).not.toHaveClass('p-4')
  })
})

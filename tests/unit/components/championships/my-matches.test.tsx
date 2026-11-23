import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MyMatches } from '@/components/championships/my-matches'
import { makeView } from '../../fixtures/championship-views'

describe('MyMatches', () => {
  it("shows each of the viewer's matches as a card that opens its championship", () => {
    render(
      <MyMatches
        matches={[{ ...makeView(), rival: 'Bruno y Lucía', href: '/campeonatos/ch1', championshipName: 'Copa de Primavera' }]}
      />,
    )
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/campeonatos/ch1')
    expect(link).toHaveTextContent('Copa de Primavera · 6ta Libre · Zona A')
    expect(link).toHaveTextContent('Hoy 08:00')
    expect(link).toHaveTextContent('Cancha 1')
    expect(screen.getByRole('article', { name: 'Ana y Pedro contra Bruno y Lucía' })).toBeInTheDocument()
    // The whole card is the link: no share button inside it.
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

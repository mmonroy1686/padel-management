import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MyMatches } from '@/components/championships/my-matches'
import { makeView } from '../../fixtures/championship-views'

describe('MyMatches', () => {
  it('lists the viewer\'s matches with time, court, category, rival and state', () => {
    render(
      <MyMatches
        matches={[{ ...makeView(), rival: 'Bruno y Lucía', href: '/campeonatos/ch1', championshipName: 'Copa de Primavera' }]}
      />,
    )
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/campeonatos/ch1')
    expect(link).toHaveTextContent('Hoy 08:00 · Cancha 1')
    expect(link).toHaveTextContent('Copa de Primavera · 6ta Libre · Zona A')
    expect(link).toHaveTextContent('vs Bruno y Lucía · Programado')
  })
})

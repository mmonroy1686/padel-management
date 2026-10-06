import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MatchLine } from '@/components/championships/match-line'
import { makeView } from '../../fixtures/championship-views'

describe('MatchLine', () => {
  it('shows where and when, both sides, the score and the state, with the winner in bold', () => {
    render(
      <MatchLine
        match={makeView({ status: 'finished', statusLabel: 'Terminado', score: '6-3 6-4', winner: 'a' })}
        showCategory
      />,
    )
    expect(screen.getByText('6ta Libre · Zona A · Hoy 08:00 · Cancha 1')).toBeInTheDocument()
    expect(screen.getByText('Ana y Pedro')).toHaveClass('font-semibold')
    expect(screen.getByText('Bruno y Lucía')).not.toHaveClass('font-semibold')
    expect(screen.getByText('6-3 6-4 · Terminado')).toBeInTheDocument()
  })
})

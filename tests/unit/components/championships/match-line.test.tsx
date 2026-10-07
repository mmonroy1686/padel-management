import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MatchLine } from '@/components/championships/match-line'
import { makeView } from '../../fixtures/championship-views'

const FINISHED = makeView({
  status: 'finished',
  statusLabel: 'Terminado',
  score: '6-3 6-4',
  winner: 'a',
  sets: [
    { a: 6, b: 3, superTiebreak: false, inProgress: false },
    { a: 6, b: 4, superTiebreak: false, inProgress: false },
  ],
})

describe('MatchLine', () => {
  it('shows the stage, the state, when and where as separate labels', () => {
    render(<MatchLine match={FINISHED} showCategory />)
    const card = screen.getByRole('article', { name: 'Ana y Pedro contra Bruno y Lucía' })
    expect(within(card).getByText('6ta Libre · Zona A')).toBeInTheDocument()
    expect(within(card).getByText('Terminado')).toBeInTheDocument()
    expect(within(card).getByText('Hoy 08:00')).toBeInTheDocument()
    expect(within(card).getByText('Cancha 1')).toBeInTheDocument()
  })

  it('puts each pair on its own row with the games of every set, and marks the winner', () => {
    render(<MatchLine match={FINISHED} />)
    const [a, b] = screen.getAllByRole('row')
    expect(a).toHaveAttribute('data-winner', 'true')
    expect(within(a).getByText('Ana y Pedro')).toBeInTheDocument()
    expect(within(a).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['6', '6'])
    expect(within(a).getByText('Ganó')).toBeInTheDocument()
    expect(b).toHaveAttribute('data-winner', 'false')
    expect(within(b).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['3', '4'])
  })

  it('says a match is being played, and shows a pair still to be decided as such', () => {
    render(
      <MatchLine
        match={makeView({ status: 'playing', statusLabel: 'En juego', sideB: '1° Zona B', entryB: null, sets: [], score: null, winner: null })}
      />,
    )
    expect(screen.getByText('En juego')).toBeInTheDocument()
    expect(screen.getByText('1° Zona B')).toHaveClass('italic')
  })
})


describe('MatchLine live', () => {
  it('marks the set being played', () => {
    render(
      <MatchLine
        match={makeView({
          status: 'playing',
          statusLabel: 'En juego',
          score: '6-4 2-1',
          sets: [
            { a: 6, b: 4, superTiebreak: false, inProgress: false },
            { a: 2, b: 1, superTiebreak: false, inProgress: true },
          ],
        })}
      />,
    )
    const [a, b] = screen.getAllByRole('row')
    expect(within(a).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['6', '2'])
    expect(within(a).getByRole('cell', { name: '2 (set en juego)' })).toHaveAttribute('data-live', 'true')
    expect(within(a).getAllByRole('cell')[0]).not.toHaveAttribute('data-live')
    expect(within(b).getByRole('cell', { name: '1 (set en juego)' })).toBeInTheDocument()
  })
})

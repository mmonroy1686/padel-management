import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MatchCard } from '@/components/championships/match-card'
import { makeView } from '../../fixtures/championship-views'

const PLAYED = makeView({
  status: 'finished',
  winner: 'a',
  sets: [
    { a: 6, b: 4, superTiebreak: false, inProgress: false },
    { a: 6, b: 3, superTiebreak: false, inProgress: false },
  ],
})

describe('MatchCard', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows when and where, each pair with its initials and its games, the winner marked by more than color', () => {
    render(<MatchCard match={PLAYED} />)
    const card = screen.getByRole('article', { name: 'Ana y Pedro contra Bruno y Lucía' })
    expect(card).toHaveTextContent('Hoy 08:00')
    expect(card).toHaveTextContent('Cancha 1')
    const [winner, loser] = within(card).getAllByRole('row')
    expect(winner).toHaveTextContent('AP')
    expect(within(winner).getByRole('rowheader')).toHaveTextContent('Ana y Pedro (ganó)')
    expect(within(winner).getByRole('rowheader')).toHaveClass('font-bold')
    expect(within(winner).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['6', '6'])
    expect(within(loser).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['4', '3'])
  })

  it('marks a match in play and the set being played', () => {
    render(<MatchCard match={makeView({ status: 'playing', sets: [{ a: 3, b: 2, superTiebreak: false, inProgress: true }] })} />)
    expect(screen.getByRole('article')).toHaveTextContent('En juego')
    expect(screen.getAllByRole('cell')[0]).toHaveAccessibleName('3 (set en juego)')
  })

  it('shares the match with the phone', async () => {
    const share = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { ...navigator, share })
    render(<MatchCard match={PLAYED} share={{ title: 'Copa', text: 'Ana y Pedro ganaron 6-4 6-3' }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Compartir Ana y Pedro contra Bruno y Lucía' }))
    expect(share).toHaveBeenCalledWith({ title: 'Copa', text: 'Ana y Pedro ganaron 6-4 6-3' })
  })

  it('shows a pair still unknown without initials', () => {
    render(<MatchCard match={makeView({ sideB: 'Ganador SF1', entryB: null })} />)
    const [, unknown] = screen.getAllByRole('row')
    expect(unknown).toHaveTextContent('?')
    expect(within(unknown).getByRole('rowheader')).toHaveClass('italic')
  })
})

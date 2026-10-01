import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FixtureList } from '@/components/tournaments/fixture-list'
import { RankingTable } from '@/components/tournaments/ranking-table'
import { at, TIMEZONE } from '../../fixtures/grid'
import { makeEntries, makeGame, makeTournament } from '../../fixtures/tournaments'

describe('FixtureList', () => {
  it('shows each round with its games, courts, times and results', () => {
    const tournament = makeTournament({
      status: 'in_progress',
      entries: makeEntries(8),
      games: [
        makeGame('g1', ['e1', 'e2'], ['e3', 'e4'], 14),
        makeGame('g2', ['e5', 'e6'], ['e7', 'e8'], null, { courtName: 'Cancha 2' }),
        makeGame('g3', ['e1', 'e3'], ['e5', 'e7'], null, { round: 2, startsAt: at('18:20') }),
      ],
    })
    render(<FixtureList tournament={tournament} timezone={TIMEZONE} myEntryId="e5" />)
    const [first, second] = screen.getAllByRole('group')
    expect(within(first).getAllByRole('listitem')).toHaveLength(2)
    expect(first).toHaveTextContent('18:00, Cancha 1')
    expect(first).toHaveTextContent('Jugador 1 y Jugador 2 14 a 10 Jugador 3 y Jugador 4')
    expect(first).toHaveTextContent('Jugador 5 y Jugador 6 vs Jugador 7 y Jugador 8')
    expect(second).toHaveTextContent('18:20, Cancha 1')
  })

  it('opens the round being played, folds the rest and marks the games of the viewer', () => {
    const tournament = makeTournament({
      status: 'in_progress',
      entries: makeEntries(8),
      games: [
        makeGame('g1', ['e1', 'e2'], ['e3', 'e4'], 14),
        makeGame('g2', ['e5', 'e6'], ['e7', 'e8'], 12),
        makeGame('g3', ['e1', 'e3'], ['e5', 'e7'], null, { round: 2 }),
        makeGame('g4', ['e2', 'e4'], ['e6', 'e8'], null, { round: 3 }),
      ],
    })
    render(<FixtureList tournament={tournament} timezone={TIMEZONE} myEntryId="e5" />)
    expect(screen.getAllByRole('group').map((round) => round.hasAttribute('open'))).toEqual([false, true, false])
    const mine = screen.getAllByRole('listitem').filter((item) => item.textContent?.includes('Tu partido'))
    expect(mine).toHaveLength(2)
  })
})

describe('RankingTable', () => {
  it('lists position, name, points, games played, won and difference, marking the viewer', () => {
    render(
      <RankingTable
        rows={[
          { entryId: 'e2', name: 'Bruno', position: 1, points: 38, played: 3, won: 2, diff: 4 },
          { entryId: 'e1', name: 'Ana', position: 2, points: 36, played: 3, won: 1, diff: 0 },
          { entryId: 'e3', name: 'Carla', position: 3, points: 34, played: 3, won: 0, diff: -4 },
        ]}
        highlightEntryId="e1"
      />,
    )
    const rows = within(screen.getByRole('table', { name: 'Ranking' })).getAllByRole('row')
    expect(rows).toHaveLength(4)
    expect(rows[1]).toHaveTextContent('1Bruno3832+4')
    expect(rows[2]).toHaveAttribute('aria-current', 'true')
    expect(rows[2]).toHaveTextContent('Ana (vos)')
    expect(rows[3]).toHaveTextContent('3Carla3430-4')
  })
})

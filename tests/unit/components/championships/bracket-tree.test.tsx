import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BracketTree } from '@/components/championships/bracket-tree'
import type { Bracket } from '@/lib/domain/championship-views'
import { makeView } from '../../fixtures/championship-views'

const semi = (position: number, sideA: string, sideB: string) =>
  makeView({ id: `s${position}`, stage: 'knockout', name: `Semifinal ${position}`, round: 2, position, groupId: null, sideA, sideB })

const BRACKET: Bracket = {
  categoryId: 'k1',
  categoryName: '6ta Libre',
  rounds: [
    {
      round: 2,
      name: 'Semifinal',
      matches: [
        { ...semi(1, 'Ana y Pedro', 'Bruno y Lucía'), status: 'finished', winner: 'a', sets: [{ a: 6, b: 2, superTiebreak: false, inProgress: false }] },
        semi(2, 'Carla y Diego', 'Eva y Fede'),
      ],
    },
    {
      round: 1,
      name: 'Final',
      matches: [makeView({ id: 'f', stage: 'knockout', name: 'Final', round: 1, position: 1, groupId: null, sideA: 'Ana y Pedro', entryB: null, sideB: 'Ganador SF2' })],
    },
  ],
}

describe('BracketTree', () => {
  it('draws one column per round with its count, the matches in order and the winner marked', () => {
    render(<BracketTree bracket={BRACKET} />)
    const draw = screen.getByRole('region', { name: 'Cuadro de 6ta Libre' })
    const rounds = within(draw).getAllByRole('listitem')
    expect(rounds.map((round) => within(round).getByRole('heading').textContent)).toEqual(['Semifinal (2 partidos)', 'Final (1 partido)'])
    expect(within(rounds[0]).getAllByRole('article').map((match) => match.getAttribute('aria-label'))).toEqual([
      'Semifinal 1: Ana y Pedro contra Bruno y Lucía',
      'Semifinal 2: Carla y Diego contra Eva y Fede',
    ])
    expect(within(rounds[0]).getAllByRole('article')[0]).toHaveTextContent('Ana y Pedro (ganó)')
    expect(within(rounds[1]).getByRole('article')).toHaveTextContent('Ganador SF2')
  })

  it('joins each pair of matches to the next round', () => {
    const { container } = render(<BracketTree bracket={BRACKET} />)
    const pairs = container.querySelectorAll('[data-pair]')
    // The semifinals pair draws the joining line; the final, last, draws none.
    expect(pairs[0].className).toContain('before:border-l')
    expect(pairs[1].className).not.toContain('before:border-l')
  })
})

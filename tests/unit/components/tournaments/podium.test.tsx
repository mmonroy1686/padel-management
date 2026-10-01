import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Podium } from '@/components/tournaments/podium'
import type { RankingRow } from '@/lib/domain/tournament-ranking'

const ROWS: RankingRow[] = [
  { entryId: 'e1', name: 'Federico Silva', position: 1, points: 45, played: 3, won: 3, diff: 18 },
  { entryId: 'e2', name: 'Mariana Gómez', position: 2, points: 39, played: 3, won: 2, diff: 6 },
  { entryId: 'e3', name: 'Nicolás Rodríguez', position: 3, points: 37, played: 3, won: 1, diff: 2 },
  { entryId: 'e4', name: 'Paula Ramírez', position: 3, points: 37, played: 3, won: 1, diff: 2 },
  { entryId: 'e5', name: 'Martín Suárez', position: 5, points: 35, played: 3, won: 2, diff: -2 },
]

describe('Podium', () => {
  it('crowns the champion once the tournament is over, with second and third', () => {
    render(<Podium rows={ROWS} finished />)
    const podium = screen.getByRole('list', { name: 'Podio' })
    const places = within(podium).getAllByRole('listitem')
    expect(places).toHaveLength(3)
    expect(places[0]).toHaveTextContent('CampeónFederico Silva45 pts')
    expect(places[1]).toHaveTextContent('2.ºMariana Gómez39 pts')
    expect(places[2]).toHaveTextContent('3.ºNicolás Rodríguez37 pts')
  })

  it('says who leads while it is played and marks the viewer', () => {
    render(<Podium rows={ROWS} finished={false} highlightEntryId="e2" />)
    const places = screen.getAllByRole('listitem')
    expect(places[0]).toHaveTextContent('Va ganando')
    expect(places[1]).toHaveTextContent('Mariana Gómez (vos)')
  })

  it('shows nothing before any result', () => {
    const { container } = render(<Podium rows={ROWS.map((row) => ({ ...row, played: 0, points: 0 }))} finished={false} />)
    expect(container).toBeEmptyDOMElement()
  })
})

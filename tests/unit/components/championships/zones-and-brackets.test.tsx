import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BracketView } from '@/components/championships/bracket-view'
import { ZonesView } from '@/components/championships/zones-view'
import { makeView, makeZone } from '../../fixtures/championship-views'

describe('ZonesView', () => {
  it('shows each group with its table, its ties and what goes below', () => {
    render(
      <ZonesView
        zones={[makeZone({ tiedNames: ['Ana y Pedro y Bruno y Lucía'] })]}
        footer={(zone) => <p>{`Cerrar ${zone.name}`}</p>}
      />,
    )
    const table = screen.getByRole('table', { name: 'Tabla de Zona A' })
    expect(within(table).getAllByRole('row')).toHaveLength(3)
    expect(within(table).getByRole('row', { name: /1 Ana y Pedro/ })).toHaveTextContent('2-0')
    expect(screen.getByText('Empate a definir: Ana y Pedro y Bruno y Lucía.')).toBeInTheDocument()
    expect(screen.getByText('Cerrar Zona A')).toBeInTheDocument()
  })
})

describe('BracketView', () => {
  it('shows the rounds of a category with their matches', () => {
    render(
      <BracketView
        bracket={{
          categoryId: 'k1',
          categoryName: '6ta Libre',
          rounds: [
            {
              round: 2,
              name: 'Semifinal',
              matches: [makeView({ id: 's1', name: 'Semifinal 1', stage: 'knockout', sideA: '1° Zona A', sideB: '2° Zona B' })],
            },
            { round: 1, name: 'Final', matches: [makeView({ id: 'f', name: 'Final', stage: 'knockout', sideA: 'Ganador SF1', sideB: 'Ganador SF2' })] },
          ],
        }}
      />,
    )
    const bracket = screen.getByRole('region', { name: 'Llave de 6ta Libre' })
    expect(within(bracket).getByRole('heading', { name: 'Semifinal' })).toBeInTheDocument()
    expect(bracket).toHaveTextContent('1° Zona A')
    expect(bracket).toHaveTextContent('Ganador SF1')
  })
})

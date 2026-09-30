import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MatchCard } from '@/components/matches/match-card'
import { makeMatch } from '../../fixtures/matches'

describe('MatchCard', () => {
  it('shows when, where, category, price per person and what is missing', () => {
    render(
      <MatchCard
        match={makeMatch()}
        viewerId="me"
        whenText="jue 1 20:00"
        status={{ ok: true, position: 2, text: 'Podés sumarte de revés.' }}
        risk={null}
      />,
    )
    expect(screen.getByText('jue 1 20:00')).toBeInTheDocument()
    expect(screen.getByText('Armándose, 1 de 4')).toBeInTheDocument()
    expect(screen.getByText(/4ª a 6ª, mixto/)).toBeInTheDocument()
    expect(screen.getByText(/\$400 por persona/)).toBeInTheDocument()
    expect(screen.getByText('Faltan 3: 1 de drive y 2 de revés')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sumarme de revés' })).toHaveAttribute('href', '/partidos/m1?sumarme=2')
    expect(screen.getByRole('link', { name: 'Detalle' })).toHaveAttribute('href', '/partidos/m1')
  })

  it('says why the viewer cannot join, the court risk and the reasons it is shown', () => {
    const { rerender } = render(
      <MatchCard
        match={makeMatch()}
        viewerId="me"
        whenText="jue 1 20:00"
        status={{ ok: false, text: 'Es un partido femenino.' }}
        risk={{ level: 'bad', text: 'No quedan canchas libres a esa hora. Si nadie libera una, el partido se cae.' }}
      />,
    )
    expect(screen.getByText('Es un partido femenino.')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('No quedan canchas libres')
    expect(screen.getByRole('link', { name: 'Ver partido' })).toBeInTheDocument()

    rerender(
      <MatchCard
        match={makeMatch()}
        viewerId="me"
        whenText="jue 1 20:00"
        status={{ ok: true, position: 2, text: 'Podés sumarte de revés.' }}
        risk={null}
        reasons={['Tu horario de siempre']}
      />,
    )
    expect(screen.getByRole('list', { name: 'Por qué te lo mostramos' })).toHaveTextContent('Tu horario de siempre')
  })
})

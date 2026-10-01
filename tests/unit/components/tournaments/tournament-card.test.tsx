import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TournamentCard } from '@/components/tournaments/tournament-card'
import { Icon } from '@/components/ui/icon'
import { makeEntries, makeGame, makeTournament } from '../../fixtures/tournaments'

describe('TournamentCard', () => {
  it('shows when, what, for whom, where, the format, the price and how full it is', () => {
    render(<TournamentCard tournament={makeTournament()} whenText="jue 1 18:00 a 20:20" status={{ ok: true, text: 'Inscribirme, $400' }} />)
    expect(screen.getByText('jue 1 18:00 a 20:20')).toBeInTheDocument()
    expect(screen.getByText('Americano de octubre')).toBeInTheDocument()
    expect(screen.getByText('5 de 8')).toBeInTheDocument()
    expect(screen.getByText(/4ª a 6ª, mixto/)).toBeInTheDocument()
    expect(screen.getByText(/Cancha 1 y Cancha 2/)).toBeInTheDocument()
    expect(screen.getByText(/7 rondas de 20 min, a 24 puntos/)).toBeInTheDocument()
    expect(screen.getByText(/\$400 por persona/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Inscribirme, $400' })).toHaveAttribute('href', '/torneos/t1?anotarme=1')
  })

  it('says why the player cannot sign up while registration is open', () => {
    render(<TournamentCard tournament={makeTournament()} whenText="jue 1" status={{ ok: false, text: 'Es un torneo femenino.' }} />)
    expect(screen.getByText('Es un torneo femenino.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver torneo' })).toHaveAttribute('href', '/torneos/t1')
  })

  it('only links to the tournament once it is being played', () => {
    render(
      <TournamentCard
        tournament={makeTournament({ status: 'in_progress' })}
        whenText="jue 1"
        status={{ ok: false, text: 'La inscripción está cerrada.' }}
      />,
    )
    expect(screen.getByText('En juego')).toBeInTheDocument()
    expect(screen.queryByText('La inscripción está cerrada.')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver torneo' })).toBeInTheDocument()
  })
})

describe('TournamentCard results', () => {
  const games = [makeGame('g1', ['e1', 'e2'], ['e3', 'e4'], 16), makeGame('g2', ['e1', 'e3'], ['e2', 'e4'], 14)]

  it('names the champion of a finished tournament', () => {
    render(
      <TournamentCard
        tournament={makeTournament({ status: 'finished', entries: makeEntries(4), games })}
        whenText="jue 1"
        status={{ ok: false, text: '' }}
      />,
    )
    expect(screen.getByText('Campeón: Jugador 1, 30 pts')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver resultados' })).toBeInTheDocument()
  })

  it('says who leads one being played', () => {
    render(
      <TournamentCard
        tournament={makeTournament({ status: 'in_progress', entries: makeEntries(4), games })}
        whenText="jue 1"
        status={{ ok: false, text: '' }}
      />,
    )
    expect(screen.getByText('Va ganando: Jugador 1, 30 pts')).toBeInTheDocument()
  })
})

describe('Icon', () => {
  it('has a trophy for the tournaments tab', () => {
    const { container } = render(<Icon name="trophy" />)
    expect(container.querySelector('svg[data-icon="trophy"]')).toBeInTheDocument()
  })
})

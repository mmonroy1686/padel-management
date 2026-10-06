import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ChampionshipCard } from '@/components/championships/championship-card'
import { makeCategory, makeChampionship } from '../../fixtures/championships'

describe('ChampionshipCard', () => {
  it('says when it is played, its status and its categories, and leads to it', () => {
    const championship = makeChampionship({
      categories: [makeCategory(), makeCategory({ id: 'k2', name: '5ta Damas' }), makeCategory({ id: 'k3', name: '4ta', status: 'cancelled' })],
    })
    render(<ChampionshipCard championship={championship} href="/campeonatos/ch1" actionLabel="Ver categorías y anotarme" primary />)
    expect(screen.getByText('Campeonato de Primavera')).toBeInTheDocument()
    expect(screen.getByText('Del sábado 17 de octubre al domingo 18 de octubre')).toBeInTheDocument()
    expect(screen.getByText('Inscripción abierta')).toBeInTheDocument()
    expect(screen.getByText('6ta Libre · 5ta Damas')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver categorías y anotarme' })).toHaveAttribute('href', '/campeonatos/ch1')
  })
})

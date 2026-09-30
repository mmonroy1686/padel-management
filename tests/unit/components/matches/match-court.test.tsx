import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MatchCourt } from '@/components/matches/match-court'
import { makeMatch, withPlayers } from '../../fixtures/matches'

describe('MatchCourt', () => {
  it('draws the four spots with first names, "Vos" and what is missing', () => {
    render(<MatchCourt match={withPlayers(makeMatch(), ['ana', 'me', null, null])} viewerId="me" />)
    const court = screen.getByRole('group', { name: 'Cancha con 2 de 4 jugadores' })
    expect(court).toHaveTextContent('Jugador')
    expect(court).toHaveTextContent('Vos')
    expect(screen.getAllByText('Falta')).toHaveLength(2)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('lets the viewer tap a spot he can take', async () => {
    const onJoin = vi.fn()
    render(<MatchCourt match={makeMatch()} viewerId="me" joinable={[2, 4]} onJoin={onJoin} />)
    const buttons = screen.getAllByRole('button', { name: 'Sumarme de revés' })
    expect(buttons).toHaveLength(2)
    await userEvent.click(buttons[1])
    expect(onJoin).toHaveBeenCalledWith(4)
  })
})

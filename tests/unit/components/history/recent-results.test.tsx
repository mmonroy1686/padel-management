import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RecentResults } from '@/components/history/recent-results'
import type { PlayedBooking, ResultPlayer } from '@/lib/domain/booking-result'

const players: ResultPlayer[] = [
  { position: 1, name: 'Ana', team: null, isMe: true },
  { position: 2, name: 'Bruno', team: null, isMe: false },
  { position: 3, name: 'Pedro', team: null, isMe: false },
  { position: 4, name: 'Juan', team: null, isMe: false },
]
const played = (id: string, day: number, result: PlayedBooking['result']): PlayedBooking => ({
  bookingId: id,
  startsAt: new Date(`2026-11-${day}T21:00:00Z`),
  courtName: 'Cancha 1',
  players,
  result,
})

describe('RecentResults', () => {
  it('shows the run, and each match won or lost with its sets and who played', () => {
    render(
      <RecentResults
        timezone="America/Montevideo"
        today="2026-11-28"
        played={[
          played('b1', 27, { teamA: [1, 2], gamesA: [6, 4, 7], gamesB: [4, 6, 5] }),
          played('b2', 26, { teamA: [1, 3], gamesA: [3, 4], gamesB: [6, 6] }),
          played('b3', 25, null),
        ]}
      />,
    )
    expect(screen.getByText(/de los últimos 2/)).toHaveTextContent('Ganaste 1 de los últimos 2')
    const run = screen.getByRole('list', { name: /Últimos resultados/ })
    expect(within(run).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Gganado', 'Pperdido'])
    expect(screen.getByText('Ganaste')).toBeInTheDocument()
    expect(screen.getByLabelText('Sets: 6-4 4-6 7-5')).toBeInTheDocument()
    expect(screen.getByText('Con Bruno · vs Pedro y Juan')).toBeInTheDocument()
    expect(screen.getByText('Perdiste')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cargar resultado' })).toHaveAttribute('href', '/perfil/partidos')
    expect(screen.getByRole('link', { name: 'Ver todos' })).toHaveAttribute('href', '/perfil/partidos')
  })

  it('nothing without played bookings', () => {
    const { container } = render(<RecentResults played={[]} timezone="America/Montevideo" today="2026-11-28" />)
    expect(container).toBeEmptyDOMElement()
  })
})

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { EventsTable, type EventRow } from '@/components/club/events-table'

const ROWS: EventRow[] = [
  { id: 'c1', name: 'Copa de Verano', when: 'sáb 12 y dom 13 de diciembre', at: 3, status: 'registration', statusLabel: 'Inscripción abierta',
    people: '17 parejas · 2 en espera', href: '/club/torneos/campeonatos/c1' },
  { id: 'c2', name: 'Torneo Aniversario', when: 'sáb 5 y dom 6 de diciembre', at: 2, status: 'closed', statusLabel: 'Inscripción cerrada',
    people: '9 parejas', href: '/club/torneos/campeonatos/c2' },
]

describe('EventsTable', () => {
  it('lists each event with when, status and who is in, and links to manage it', () => {
    render(<EventsTable caption="Campeonatos" rows={ROWS} peopleLabel="Parejas" emptyText="Nada" />)
    const copa = screen.getByRole('cell', { name: 'Copa de Verano' }).closest('tr') as HTMLElement
    expect(copa).toHaveTextContent('Inscripción abierta')
    expect(copa).toHaveTextContent('17 parejas · 2 en espera')
    expect(within(copa).getByRole('link', { name: 'Gestionar Copa de Verano' })).toHaveAttribute('href', '/club/torneos/campeonatos/c1')
  })

  it('filters by status, with the statuses it has', async () => {
    render(<EventsTable caption="Campeonatos" rows={ROWS} peopleLabel="Parejas" emptyText="Nada" />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Estado' }), 'closed')
    expect(screen.queryByRole('cell', { name: 'Copa de Verano' })).not.toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Torneo Aniversario' })).toBeInTheDocument()
  })

  it('says when there is none', () => {
    render(<EventsTable caption="Campeonatos" rows={[]} peopleLabel="Parejas" emptyText="Todavía no hay campeonatos." />)
    expect(screen.getByText('Todavía no hay campeonatos.')).toBeInTheDocument()
  })
})

import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EventsBoard } from '@/components/club/events-board'
import { CHAMPIONSHIP_GROUPS, type EventRow } from '@/lib/domain/event-groups'

const row = (overrides: Partial<EventRow>): EventRow => ({
  id: 'c1',
  name: 'Primavera',
  when: 'Del sábado 21 al domingo 29 de noviembre',
  at: 1,
  status: 'registration',
  statusLabel: 'Inscripción abierta',
  people: '17 parejas · 2 en espera',
  href: '/club/torneos/campeonatos/c1',
  nextStep: 'Siguiente: cerrar la inscripción',
  ...overrides,
})

describe('EventsBoard', () => {
  it('shows each group with its count and each event as a card that opens it', () => {
    render(
      <EventsBoard
        label="Campeonatos"
        groups={CHAMPIONSHIP_GROUPS}
        rows={[row({}), row({ id: 'c2', name: 'Otoño', status: 'drawn', statusLabel: 'Sorteado', nextStep: 'Siguiente: programar y publicar el fixture' })]}
        emptyText="Todavía no hay campeonatos."
      />,
    )
    const open = screen.getByRole('region', { name: 'Inscripción abierta, 1' })
    const card = within(open).getByRole('link', { name: 'Gestionar Primavera' })
    expect(card).toHaveAttribute('href', '/club/torneos/campeonatos/c1')
    expect(card).toHaveTextContent('Del sábado 21 al domingo 29 de noviembre')
    expect(card).toHaveTextContent('17 parejas · 2 en espera')
    expect(card).toHaveTextContent('Siguiente: cerrar la inscripción')
    // The group already says it: no badge.
    expect(card).not.toHaveTextContent('Inscripción abierta')
    const setup = screen.getByRole('region', { name: 'Armando el fixture, 1' })
    expect(within(setup).getByRole('link', { name: 'Gestionar Otoño' })).toHaveTextContent('Sorteado')
  })

  it('folds what is over at the end', () => {
    render(
      <EventsBoard
        label="Campeonatos"
        groups={CHAMPIONSHIP_GROUPS}
        rows={[row({ status: 'finished', statusLabel: 'Finalizado', nextStep: null })]}
        emptyText="Todavía no hay campeonatos."
      />,
    )
    const past = screen.getByText('Terminados y cancelados (1)').closest('details')
    expect(past).not.toHaveAttribute('open')
  })

  it('says so when there are no events', () => {
    render(<EventsBoard label="Campeonatos" groups={CHAMPIONSHIP_GROUPS} rows={[]} emptyText="Todavía no hay campeonatos." />)
    expect(screen.getByText('Todavía no hay campeonatos.')).toBeInTheDocument()
  })
})

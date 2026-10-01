import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RecurringOverview, type OverviewSeries, type OverviewSkip } from '@/components/club/recurring-overview'

// 2026-10-01 is a Thursday.
const TODAY = '2026-10-01'
const SERIES: OverviewSeries[] = [
  { id: 's1', weekday: 4, startTime: '20:30', courtName: 'Cancha 1', holder: 'Los de siempre', endsOn: null },
  { id: 's2', weekday: 5, startTime: '19:00', courtName: 'Cancha 2', holder: 'Gonzalo Núñez', endsOn: '2026-11-27' },
  { id: 's3', weekday: 6, startTime: '20:30', courtName: 'Cancha 1', holder: 'Escuela de pádel', endsOn: null },
]
const SKIPS: OverviewSkip[] = [
  { id: 'k1', date: '2026-10-03', startTime: '20:30', courtName: 'Cancha 1', holder: 'Escuela de pádel', reason: 'la cancha estaba ocupada' },
  { id: 'k2', date: '2026-10-09', startTime: '19:00', courtName: 'Cancha 2', holder: 'Gonzalo Núñez', reason: 'la cancha estaba ocupada' },
]

function renderOverview(series = SERIES, skips = SKIPS) {
  render(<RecurringOverview series={series} skips={skips} today={TODAY} slotMinutes={90} />)
}

describe('RecurringOverview', () => {
  it('sums up the recurring slots: how many, court hours a week and dates left without a booking', () => {
    renderOverview()
    const summary = screen.getByRole('list', { name: 'Resumen de turnos fijos' })
    expect(summary).toHaveTextContent('3 turnos fijos')
    expect(summary).toHaveTextContent('4 h 30 por semana')
    expect(within(summary).getByRole('link', { name: /2\s*fechas sin reservar/ })).toHaveAttribute('href', '#salteadas')
  })

  it('lays the week out by day, each slot linking to its next date in the grid', () => {
    renderOverview()
    const thursday = screen.getByRole('region', { name: 'jueves' })
    const slot = within(thursday).getByRole('link', { name: /20:30.*Cancha 1.*Los de siempre/ })
    expect(slot).toHaveAttribute('href', '/club/grilla?dia=2026-10-01')
    expect(screen.getByRole('region', { name: 'viernes' })).toHaveTextContent('hasta el vie 27/11')
  })

  it('lists the skipped dates by day with what to do about them', () => {
    renderOverview()
    const skipped = screen.getByRole('region', { name: /Fechas sin reservar/ })
    const saturday = within(skipped).getAllByRole('listitem')[0]
    expect(saturday).toHaveTextContent('sáb 3/10')
    expect(saturday).toHaveTextContent('20:30, Cancha 1 · Escuela de pádel')
    expect(saturday).toHaveTextContent('La cancha estaba ocupada')
    expect(within(saturday).getByRole('link', { name: 'Ver el sáb 3/10 en la grilla' })).toHaveAttribute('href', '/club/grilla?dia=2026-10-03')
  })

  it('says all is well when nothing was skipped, and how to add one when there are none', () => {
    renderOverview([], [])
    expect(screen.getByText('No hay turnos fijos todavía. Se cargan desde la grilla, tocando una cancha libre.')).toBeInTheDocument()
    expect(screen.getByText('Todos los turnos fijos tienen su reserva.')).toBeInTheDocument()
  })
})

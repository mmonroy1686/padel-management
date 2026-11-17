import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HomeDay } from '@/components/club/home-day'
import type { DayOccupancy } from '@/lib/domain/club-home'
import { at, TIMEZONE } from '../../fixtures/grid'

const occupancy: DayOccupancy = {
  percent: 68,
  free: 7,
  slots: [
    { courtName: 'Cancha 1', startsAt: at('17:30'), label: '17:30 Cancha 1' },
    { courtName: 'Cancha 2', startsAt: at('19:00'), label: '19:00 Cancha 2' },
  ],
}
const card = (name: string) => screen.getByRole('article', { name })

describe('HomeDay', () => {
  it('Ocupación: the day in a bar, the free slots left and the next ones, with a link to the Grilla', () => {
    render(<HomeDay occupancy={occupancy} alerts={[]} cancellations={[]} timezone={TIMEZONE} />)
    const ocupacion = card('Ocupación')
    expect(within(ocupacion).getByRole('progressbar', { name: 'Ocupación del día' })).toHaveAttribute('aria-valuenow', '68')
    expect(ocupacion).toHaveTextContent('68 % ocupado · 7 turnos libres')
    expect(
      within(within(ocupacion).getByRole('list', { name: 'Próximos horarios libres' }))
        .getAllByRole('listitem')
        .map((chip) => chip.textContent),
    ).toEqual(['17:30 Cancha 1', '19:00 Cancha 2'])
    expect(within(ocupacion).getByRole('link', { name: 'Ver la Grilla' })).toHaveAttribute('href', '/club/grilla')
  })

  it('Avisos: each with its icon, number and link', () => {
    render(
      <HomeDay
        occupancy={occupancy}
        alerts={[
          { kind: 'forming', href: '/club/grilla', text: '2 partidos armándose · faltan 3 jugadores' },
          { kind: 'tournament', href: '/club/torneos/t1', text: 'Torneo Copa de la Casa en juego' },
        ]}
        cancellations={[]}
        timezone={TIMEZONE}
      />,
    )
    const avisos = card('Avisos')
    expect(within(avisos).getByRole('link', { name: '2 partidos armándose · faltan 3 jugadores' })).toHaveAttribute(
      'href',
      '/club/grilla',
    )
    expect(within(avisos).getByRole('link', { name: 'Torneo Copa de la Casa en juego' })).toHaveAttribute(
      'href',
      '/club/torneos/t1',
    )
    expect(avisos.querySelector('[data-icon="users"]')).not.toBeNull()
  })

  it('Cancelaciones: who and what to give back, with a link to Cobros only when there is money', () => {
    render(
      <HomeDay
        occupancy={occupancy}
        alerts={[]}
        cancellations={[
          { bookingId: 'b1', courtName: 'Cancha 1', startsAt: at('18:30'), holder: 'Rodríguez', refund: 1600 },
          { bookingId: 'b2', courtName: 'Cancha 2', startsAt: at('20:00'), holder: 'Martina', refund: 0 },
        ]}
        timezone={TIMEZONE}
      />,
    )
    const cancelaciones = card('Cancelaciones de hoy')
    const rows = within(cancelaciones).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      'Cancha 1 · 18:30 · RodríguezA devolver $1.600',
      'Cancha 2 · 20:00 · Martina',
    ])
    expect(within(cancelaciones).getByRole('link', { name: 'Devolver en Cobros' })).toHaveAttribute(
      'href',
      '/club/cobros#devolver',
    )
  })

  it('says so when nothing is pending, nothing was cancelled or nothing is free', () => {
    render(<HomeDay occupancy={{ percent: 100, free: 0, slots: [] }} alerts={[]} cancellations={[]} timezone={TIMEZONE} />)
    expect(card('Ocupación')).toHaveTextContent('No quedan horarios libres hoy.')
    expect(card('Avisos')).toHaveTextContent('Nada pendiente.')
    expect(card('Cancelaciones de hoy')).toHaveTextContent('Sin cancelaciones hoy.')
    expect(screen.queryByRole('link', { name: 'Devolver en Cobros' })).not.toBeInTheDocument()
  })
})

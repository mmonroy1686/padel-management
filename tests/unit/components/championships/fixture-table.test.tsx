import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FixtureTable } from '@/components/championships/fixture-table'
import { UnplacedList } from '@/components/championships/unplaced-list'
import type { FormAction } from '@/components/ui/action-form'
import { makeView } from '../../fixtures/championship-views'

const ok = async () => ({ status: 'ok' as const, message: 'Partido fijado.' })

describe('FixtureTable', () => {
  it('lists the matches with day, time, court, category and match, to edit or pin', async () => {
    const pin = vi.fn<FormAction>(ok)
    render(
      <FixtureTable
        matches={[makeView(), makeView({ id: 'm2', startsAt: null, date: null, day: null, time: null, court: null })]}
        basePath="/club/torneos/campeonatos/ch1"
        editable
        canPin
        pinAction={pin}
      />,
    )
    const table = screen.getByRole('table', { name: 'Fixture' })
    expect(within(table).getAllByRole('row')).toHaveLength(2)
    expect(within(table).getByRole('link', { name: 'Editar Zona A: Ana y Pedro vs Bruno y Lucía' })).toHaveAttribute(
      'href',
      '/club/torneos/campeonatos/ch1?partido=m1',
    )
    await userEvent.click(within(table).getByRole('button', { name: 'Fijar' }))
    await waitFor(() => expect(pin).toHaveBeenCalled())
    const form = vi.mocked(pin).mock.calls[0][1]
    expect(form.get('matchId')).toBe('m1')
    expect(form.get('pinned')).toBe('true')
  })
})

describe('UnplacedList', () => {
  it('says why each match has no place, with a way to place it by hand', () => {
    render(
      <UnplacedList
        items={[
          {
            id: 'm2',
            title: '6ta Libre · Final: 1° Zona A vs 2° Zona A',
            reason: 'No quedan canchas libres en los días de juego.',
            href: '/club/torneos/campeonatos/ch1?partido=m2',
          },
        ]}
      />,
    )
    expect(screen.getByRole('region', { name: 'Sin lugar' })).toHaveTextContent('No quedan canchas libres en los días de juego.')
    expect(screen.getByRole('link', { name: 'Ubicar a mano: 6ta Libre · Final: 1° Zona A vs 2° Zona A' })).toHaveAttribute(
      'href',
      '/club/torneos/campeonatos/ch1?partido=m2',
    )
  })
})

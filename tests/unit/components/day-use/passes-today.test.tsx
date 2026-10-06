import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PassesToday } from '@/components/day-use/passes-today'
import { SellSheet, type SellOffer } from '@/components/day-use/sell-sheet'
import type { FormAction } from '@/components/ui/action-form'
import type { DayUsePass } from '@/lib/domain/day-use'
import { DATE, TIMEZONE } from '../../fixtures/grid'
import { makePass } from '../../fixtures/day-use'

const OFFERS: SellOffer[] = [
  { id: 'p1', name: 'Day use completo', price: 450, days: [{ date: '2026-10-01', label: 'Hoy' }, { date: '2026-10-03', label: 'sáb 3' }] },
  { id: 'p2', name: 'Pileta', price: 200, days: [{ date: '2026-10-04', label: 'dom 4' }] },
]
const MEMBERS = [{ userId: 'ana', name: 'Ana Pérez' }]
const ACTIONS = { checkIn: vi.fn<FormAction>(), cash: vi.fn<FormAction>(), cancel: vi.fn<FormAction>() }
const options = (label: string) =>
  within(screen.getByLabelText(label)).getAllByRole('option').map((option) => option.textContent)

function renderSheet(overrides: Partial<Parameters<typeof SellSheet>[0]> = {}) {
  render(
    <SellSheet offers={OFFERS} members={MEMBERS} rewardPercent={100} action={vi.fn<FormAction>()} onClose={vi.fn()} onDone={vi.fn()} {...overrides} />,
  )
}

function renderToday(passes: DayUsePass[]) {
  render(
    <PassesToday
      passes={passes}
      today={DATE}
      timezone={TIMEZONE}
      acceptsCash
      actions={ACTIONS}
      sell={{ offers: OFFERS, members: MEMBERS, rewardPercent: 100, action: vi.fn<FormAction>() }}
    />,
  )
}

describe('SellSheet', () => {
  it('sells a pass of the coming days, to a name by default', () => {
    renderSheet()
    expect(screen.getByRole('dialog', { name: 'Vender pase' })).toBeInTheDocument()
    expect(screen.getByLabelText('Pase')).toHaveValue('p1')
    expect(options('Día')).toEqual(['Hoy', 'sáb 3'])
    expect(screen.getByLabelText('A nombre de')).toBeInTheDocument()
    expect(screen.queryByLabelText('Usar su recompensa (-100%)')).not.toBeInTheDocument()
  })

  it('changes the days with the pass', async () => {
    renderSheet()
    await userEvent.selectOptions(screen.getByLabelText('Pase'), 'p2')
    expect(options('Día')).toEqual(['dom 4'])
  })

  it('offers the member\'s reward when selling to a member', async () => {
    renderSheet()
    await userEvent.click(screen.getByLabelText('Jugador del club'))
    expect(screen.getByRole('combobox', { name: 'Jugador' })).toHaveValue('')
    expect(screen.getByLabelText('Usar su recompensa (-100%)')).not.toBeChecked()
  })

  it('has no reward while the club has stamps off', async () => {
    renderSheet({ rewardPercent: null })
    await userEvent.click(screen.getByLabelText('Jugador del club'))
    expect(screen.queryByLabelText(/Usar su recompensa/)).not.toBeInTheDocument()
  })

  it('says when there is nothing to sell', () => {
    renderSheet({ offers: [] })
    expect(screen.getByText('No hay pases a la venta en los próximos días.')).toBeInTheDocument()
  })
})

describe('PassesToday', () => {
  const PASSES = [makePass(), makePass({ id: 'pass-2', code: 'DU-100200', holder: 'Bruno Díaz', playerId: 'bruno' })]

  it("lists the day's passes in a table and finds them by name or code", async () => {
    renderToday(PASSES)
    expect(screen.getByRole('heading', { name: 'Pases de hoy (2)' })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Pases de hoy' })).toBeInTheDocument()
    const search = screen.getByRole('searchbox', { name: 'Buscar por nombre o código' })
    await userEvent.type(search, 'bru')
    expect(screen.getByRole('cell', { name: /Bruno Díaz/ })).toBeInTheDocument()
    expect(screen.queryByRole('cell', { name: /Ana Pérez/ })).not.toBeInTheDocument()
    await userEvent.clear(search)
    await userEvent.type(search, 'DU-4821')
    expect(screen.getByRole('cell', { name: /Ana Pérez/ })).toBeInTheDocument()
    await userEvent.clear(search)
    await userEvent.type(search, 'zzz')
    expect(screen.getByText('Nadie coincide con la búsqueda o los filtros.')).toBeInTheDocument()
  })

  it('filters by status and opens a pass to manage it', async () => {
    renderToday([...PASSES, makePass({ id: 'pass-3', code: 'DU-300300', holder: 'Carla Ruiz', status: 'inside', checkedInAt: new Date() })])
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Estado' }), 'inside')
    expect(screen.getAllByRole('row')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'Gestionar el pase de Carla Ruiz' }))
    expect(within(screen.getByRole('dialog', { name: 'Carla Ruiz' })).getByRole('article', { name: 'Carla Ruiz' })).toBeInTheDocument()
  })

  it('opens the sale sheet', async () => {
    renderToday(PASSES)
    await userEvent.click(screen.getByRole('button', { name: 'Vender pase' }))
    expect(screen.getByRole('dialog', { name: 'Vender pase' })).toBeInTheDocument()
  })

  it('says when there are no passes yet', () => {
    renderToday([])
    expect(screen.getByText('Todavía no hay pases para hoy.')).toBeInTheDocument()
  })
})

describe('PassesToday on another day', () => {
  it('names the day it lists', () => {
    render(
      <PassesToday
        passes={[]}
        today={DATE}
        forDay="del viernes 2"
        timezone={TIMEZONE}
        acceptsCash
        actions={{ checkIn: vi.fn(), cash: vi.fn(), cancel: vi.fn() }}
        sell={{ offers: [], members: [], rewardPercent: null, action: vi.fn() }}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Pases del viernes 2 (0)' })).toBeInTheDocument()
    expect(screen.getByText('Todavía no hay pases del viernes 2.')).toBeInTheDocument()
  })
})

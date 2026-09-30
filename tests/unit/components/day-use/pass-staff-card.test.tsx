import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PassStaffCard } from '@/components/day-use/pass-staff-card'
import type { FormAction } from '@/components/ui/action-form'
import type { DayUsePass } from '@/lib/domain/day-use'
import { at, DATE, TIMEZONE } from '../../fixtures/grid'
import { makePass } from '../../fixtures/day-use'

const ACTIONS = { checkIn: vi.fn<FormAction>(), cash: vi.fn<FormAction>(), cancel: vi.fn<FormAction>() }

function renderCard(pass: DayUsePass = makePass(), acceptsCash = true) {
  render(<PassStaffCard pass={pass} today={DATE} timezone={TIMEZONE} acceptsCash={acceptsCash} actions={ACTIONS} />)
}

describe('PassStaffCard', () => {
  it('lets reception check in, charge and cancel today\'s pass', () => {
    renderCard()
    const card = screen.getByRole('article', { name: 'Ana Pérez' })
    expect(card).toHaveTextContent('Day use completo, 08:00 a 12:30')
    expect(card).toHaveTextContent('DU-482193')
    expect(card).toHaveTextContent('Pendiente de pago')
    expect(within(card).getByRole('button', { name: 'Registrar ingreso' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Cobrar $450' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Cancelar pase' })).toBeInTheDocument()
  })

  it('checks in only on the day of the pass', () => {
    renderCard(makePass({ date: '2026-10-02' }))
    expect(screen.getByText('El ingreso se registra el día del pase.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Registrar ingreso' })).not.toBeInTheDocument()
  })

  it('shows since when someone is in, with nothing left to do but charge', () => {
    renderCard(makePass({ status: 'inside', checkedInAt: at('10:12') }))
    expect(screen.getByText('Adentro')).toBeInTheDocument()
    expect(screen.getByText('Adentro desde las 10:12.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Registrar ingreso' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancelar pase' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cobrar $450' })).toBeInTheDocument()
  })

  it('charges nothing for a full reward, and says so', () => {
    renderCard(makePass({ usedReward: true, discountPercent: 100, total: 0 }))
    expect(screen.getByRole('article', { name: 'Ana Pérez' })).toHaveTextContent('Recompensa -100%')
    expect(screen.queryByRole('button', { name: /Cobrar/ })).not.toBeInTheDocument()
  })

  it('names someone without an account, and offers no cash when the club takes none', () => {
    renderCard(makePass({ holder: 'Pepe', isGuest: true, playerId: null }), false)
    expect(screen.getByRole('article', { name: 'Pepe (sin cuenta)' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cobrar/ })).not.toBeInTheDocument()
  })
})

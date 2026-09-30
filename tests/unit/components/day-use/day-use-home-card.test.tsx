import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DayUseHomeCard } from '@/components/day-use/day-use-home-card'
import type { DayUseHome } from '@/lib/domain/day-use'

const HOME: DayUseHome = {
  rule: { enabled: true, every: 5, discountPercent: 100, expiryMonths: 6 },
  loyalty: { stamps: 3, earned: 0, used: 0, available: 0, progress: 3 },
  todayPass: { id: 'pass-1', text: 'Day use completo, 08:00 a 12:30' },
  todayText: 'Hoy: 5 en el club, quedan 18 lugares',
}

describe('DayUseHomeCard', () => {
  it('shows the stamps, today\'s pass and how the day is going', () => {
    render(<DayUseHomeCard home={HOME} />)
    expect(screen.getByRole('heading', { name: 'Day use' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Tus sellos' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tu pase de hoy: Day use completo, 08:00 a 12:30' })).toHaveAttribute(
      'href',
      '/day-use/pase/pass-1',
    )
    expect(screen.getByText('Hoy: 5 en el club, quedan 18 lugares')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver day use' })).toHaveAttribute('href', '/day-use')
  })

  it('leaves the stamps out when the club has them off, and invites to buy without a pass', () => {
    render(<DayUseHomeCard home={{ ...HOME, rule: { ...HOME.rule, enabled: false }, todayPass: null, todayText: null }} />)
    expect(screen.queryByRole('list', { name: 'Tus sellos' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Comprar un pase' })).toHaveAttribute('href', '/day-use')
  })
})

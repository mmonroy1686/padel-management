import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DayStrip } from '@/components/booking/day-strip'

const DAYS = [
  { date: '2026-09-29', label: 'Hoy' },
  { date: '2026-09-30', label: 'Mañana' },
  { date: '2026-10-01', label: 'jue 1' },
]

describe('DayStrip', () => {
  it('crosses out the days without day use', () => {
    render(
      <DayStrip
        days={[...DAYS.slice(0, 2), { date: '2026-10-01', label: 'jue 1', closed: true }]}
        selected="2026-09-30"
        basePath="/day-use"
      />,
    )
    expect(screen.getByRole('link', { name: 'jue 1, sin day use' })).toHaveClass('line-through')
    expect(screen.getByRole('link', { name: 'Hoy' })).not.toHaveClass('line-through')
  })

  it('links every day to the same screen', () => {
    render(<DayStrip days={DAYS} selected="2026-09-30" basePath="/reservar" />)
    expect(screen.getByRole('navigation', { name: 'Día' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'jue 1' })).toHaveAttribute('href', '/reservar?dia=2026-10-01')
  })

  it('marks the selected day', () => {
    render(<DayStrip days={DAYS} selected="2026-09-30" basePath="/reservar" />)
    expect(screen.getByRole('link', { name: 'Mañana' })).toHaveAttribute('aria-current', 'date')
    expect(screen.getByRole('link', { name: 'Hoy' })).not.toHaveAttribute('aria-current')
  })
})

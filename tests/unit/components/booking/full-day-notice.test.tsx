import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FullDayNotice } from '@/components/booking/full-day-notice'

describe('FullDayNotice', () => {
  it('a full day leads to the next one with room', () => {
    render(<FullDayNotice full={{ href: '/reservar?dia=2026-11-27', label: 'Ver mañana (6 libres)' }} />)
    expect(screen.getByText('Este día está lleno.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver mañana (6 libres)' })).toHaveAttribute('href', '/reservar?dia=2026-11-27')
  })

  it('with nothing free all week, says so plainly', () => {
    render(<FullDayNotice full={null} />)
    expect(screen.getByText('No quedan turnos libres esta semana.')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})

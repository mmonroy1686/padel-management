import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Legend } from '@/components/booking/legend'

describe('Legend', () => {
  it('explains the player grid', () => {
    render(<Legend variant="player" />)
    const items = within(screen.getByRole('list', { name: 'Referencias' })).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual(['Libre', 'Tuya', 'Ocupada'])
  })

  it('explains the club grid', () => {
    render(<Legend variant="club" />)
    expect(screen.getByRole('list', { name: 'Referencias' })).toHaveTextContent('ReservaTurno fijoBloqueoTorneo')
  })
})

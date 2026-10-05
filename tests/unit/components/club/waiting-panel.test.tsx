import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WaitingPanel } from '@/components/club/waiting-panel'

describe('WaitingPanel', () => {
  it('lists who waits that day and for what, first in line first', () => {
    render(
      <WaitingPanel
        waits={[
          { id: 'w1', playerName: 'Ana', text: 'de 18:30 a 21:30, cualquier cancha' },
          { id: 'w2', playerName: 'Bruno', text: 'de 20:00 a 23:00, Cancha 2' },
        ]}
      />,
    )
    expect(screen.getByRole('heading', { name: 'En espera' })).toBeInTheDocument()
    const items = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual([
      'Anade 18:30 a 21:30, cualquier cancha',
      'Brunode 20:00 a 23:00, Cancha 2',
    ])
  })

  it('says when nobody is waiting', () => {
    render(<WaitingPanel waits={[]} />)
    expect(screen.getByText('Nadie espera turno este día.')).toBeInTheDocument()
  })
})

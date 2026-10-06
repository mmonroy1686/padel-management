import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DayWaitsNote } from '@/components/waitlist/day-waits-note'

describe('DayWaitsNote', () => {
  it('says what she asked to be told about that day, and opens the sheet to change it', async () => {
    const onOpen = vi.fn()
    render(<DayWaitsNote items={['de 18:30 a 21:30, cualquier cancha', 'de 20:00 a 21:30, Cancha 2']} onOpen={onOpen} />)
    const note = screen.getByRole('region', { name: 'Te avisamos si se libera' })
    expect(note).toHaveTextContent('de 18:30 a 21:30, cualquier cancha')
    expect(note).toHaveTextContent('de 20:00 a 21:30, Cancha 2')
    await userEvent.click(screen.getByRole('button', { name: 'Ver o cancelar' }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('shows nothing when she waits for nothing that day', () => {
    const { container } = render(<DayWaitsNote items={[]} onOpen={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})

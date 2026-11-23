import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RecommendedSlots } from '@/components/assistant/recommended-slots'
import { boardSlot, strongRows } from '../../fixtures/assistant'

describe('RecommendedSlots', () => {
  it('lists the slots worth a match and opens one', async () => {
    const onPick = vi.fn()
    const slot = boardSlot('court-2', '20:00', strongRows(8))
    const text = 'Jueves 20:00 · Cancha 2 · 5ª masculino · 8 posibles'
    render(<RecommendedSlots items={[{ slot, text }]} onPick={onPick} />)
    expect(screen.getByRole('heading', { name: 'Recomendados para armar' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: `Armar ${text}` }))
    expect(onPick).toHaveBeenCalledWith(slot)
  })

  it('is not there when no slot has demand', () => {
    const { container } = render(<RecommendedSlots items={[]} onPick={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})

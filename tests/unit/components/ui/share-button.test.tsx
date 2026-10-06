import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShareButton } from '@/components/ui/share-button'

const TEXT = 'Seguí el Campeonato de Primavera en vivo: https://rustic.uy/c/primavera-7k2f'

afterEach(() => {
  delete (navigator as { share?: unknown }).share
})

describe('ShareButton', () => {
  it('opens the phone\'s share sheet with the message', async () => {
    const share = vi.fn(async () => {})
    Object.defineProperty(navigator, 'share', { value: share, configurable: true, writable: true })
    render(<ShareButton title="Campeonato de Primavera" text={TEXT} />)
    fireEvent.click(screen.getByRole('button', { name: 'Compartir' }))
    await waitFor(() => expect(share).toHaveBeenCalledWith({ title: 'Campeonato de Primavera', text: TEXT }))
  })

  it('copies the message on a computer and says so', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<ShareButton title="Campeonato de Primavera" text={TEXT} />)
    fireEvent.click(screen.getByRole('button', { name: 'Compartir' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Link copiado. Pegalo donde quieras.')
    expect(writeText).toHaveBeenCalledWith(TEXT)
  })
})

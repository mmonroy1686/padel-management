import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TvBoard } from '@/app/c/[code]/tv/tv-board'
import { makeView } from '../../fixtures/championship-views'

describe('TvBoard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('turns every 20 seconds between what is being played, what comes next and each bracket', () => {
    render(
      <TvBoard
        name="Campeonato de Primavera"
        screens={[
          { key: 'playing', title: 'En juego ahora', matches: [makeView({ status: 'playing', statusLabel: 'En juego' })] },
          { key: 'upcoming', title: 'Próximos', matches: [] },
          {
            key: 'k1',
            title: 'Llave · 6ta Libre',
            bracket: { categoryId: 'k1', categoryName: '6ta Libre', rounds: [{ round: 1, name: 'Final', matches: [makeView({ id: 'f', name: 'Final' })] }] },
          },
        ]}
      />,
    )
    expect(screen.getByRole('heading', { name: 'En juego ahora' })).toBeInTheDocument()
    expect(screen.getByText('Ana y Pedro')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(20_000))
    expect(screen.getByRole('heading', { name: 'Próximos' })).toBeInTheDocument()
    expect(screen.getByText('Nada por ahora.')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(20_000))
    expect(screen.getByRole('region', { name: 'Llave de 6ta Libre' })).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(20_000))
    expect(screen.getByRole('heading', { name: 'En juego ahora' })).toBeInTheDocument()
  })
})

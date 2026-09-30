import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CreateMatchSheet } from '@/components/matches/create-match-sheet'
import type { FormAction } from '@/components/ui/action-form'
import type { MatchFormOptions } from '@/lib/domain/matches'

const OPTIONS: MatchFormOptions = {
  days: [
    { date: '2026-10-01', label: 'Hoy' },
    { date: '2026-10-02', label: 'Mañana' },
  ],
  times: ['18:30', '20:00', '21:30'],
  courts: [
    { id: 'c1', name: 'Cancha 1' },
    { id: 'c2', name: 'Cancha 2' },
  ],
  defaults: { categoryMin: 4, categoryMax: 6, type: 'male', side: 'backhand' },
}

describe('CreateMatchSheet', () => {
  it('proposes the player category range, gender and side, at 20:00', () => {
    render(<CreateMatchSheet open onClose={vi.fn()} action={vi.fn<FormAction>()} options={OPTIONS} />)
    expect(screen.getByRole('dialog', { name: 'Armar partido abierto' })).toBeInTheDocument()
    expect(screen.getByLabelText('Hora')).toHaveValue('20:00')
    expect(screen.getByLabelText('Categoría desde')).toHaveValue('4')
    expect(screen.getByLabelText('hasta')).toHaveValue('6')
    expect(screen.getByLabelText('Partido')).toHaveValue('male')
    expect(screen.getByLabelText('Vos jugás de')).toHaveValue('backhand')
    expect(screen.getByLabelText('Si mi cancha se ocupa, usar otra libre')).toBeChecked()
  })

  it('starts from the slot chosen on the grid and sends every choice', async () => {
    const action = vi.fn<FormAction>(async () => ({ status: 'ok', message: '' }))
    render(
      <CreateMatchSheet
        open
        onClose={vi.fn()}
        action={action}
        options={OPTIONS}
        initial={{ date: '2026-10-02', time: '21:30', courtId: 'c2' }}
      />,
    )
    await userEvent.selectOptions(screen.getByLabelText('Partido'), 'Mixto')
    await userEvent.click(screen.getByRole('button', { name: 'Publicar partido' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect(Object.fromEntries(action.mock.calls[0][1].entries())).toEqual({
      date: '2026-10-02',
      time: '21:30',
      courtId: 'c2',
      matchType: 'mixed',
      categoryMin: '4',
      categoryMax: '6',
      side: 'backhand',
      allowOtherCourt: 'on',
    })
  })
})

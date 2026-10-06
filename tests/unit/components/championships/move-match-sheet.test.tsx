import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MoveMatchSheet } from '@/components/championships/move-match-sheet'
import type { FormAction } from '@/components/ui/action-form'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const ok = async () => ({ status: 'ok' as const, message: 'Partido movido.' })
const OPTIONS = [
  { value: 'court-1|2026-10-17T12:30:00.000Z', label: 'Hoy 09:30 · Cancha 1' },
  { value: 'court-2|2026-10-17T12:30:00.000Z', label: 'Hoy 09:30 · Cancha 2' },
]

beforeEach(() => push.mockClear())

describe('MoveMatchSheet', () => {
  it('moves a match to one of the valid courts and times, and goes back to the fixture', async () => {
    const move = vi.fn<FormAction>(ok)
    render(<MoveMatchSheet matchId="m1" title="6ta Libre · Zona A" options={OPTIONS} closeHref="/club/torneos/campeonatos/ch1" action={move} />)
    const sheet = screen.getByRole('dialog', { name: 'Mover partido' })
    await userEvent.selectOptions(screen.getByLabelText('Cancha y horario'), 'court-2|2026-10-17T12:30:00.000Z')
    await userEvent.click(screen.getByRole('button', { name: 'Mover' }))
    await waitFor(() => expect(move).toHaveBeenCalled())
    const form = vi.mocked(move).mock.calls[0][1]
    expect(form.get('matchId')).toBe('m1')
    expect(form.get('slot')).toBe('court-2|2026-10-17T12:30:00.000Z')
    await waitFor(() => expect(push).toHaveBeenCalledWith('/club/torneos/campeonatos/ch1'))
    expect(sheet).toBeInTheDocument()
  })

  it('says when there is nowhere else to put it', () => {
    render(<MoveMatchSheet matchId="m1" title="6ta Libre · Zona A" options={[]} closeHref="/x" action={vi.fn<FormAction>(ok)} />)
    expect(screen.getByText('No hay otra cancha ni horario donde entre este partido.')).toBeInTheDocument()
  })
})

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChampionshipControls, type ControlActions } from '@/components/championships/championship-controls'
import type { FormAction } from '@/components/ui/action-form'

const ok = async () => ({ status: 'ok' as const, message: 'Listo.' })

function actions(): ControlActions {
  return { open: vi.fn<FormAction>(ok), close: vi.fn<FormAction>(ok), cancel: vi.fn<FormAction>(ok) }
}

describe('ChampionshipControls', () => {
  it('says what a draft still needs before opening', () => {
    render(<ChampionshipControls championshipId="ch1" status="draft" readiness="Agregá al menos una categoría." actions={actions()} />)
    expect(screen.getByText('Agregá al menos una categoría.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Abrir inscripción' })).not.toBeInTheDocument()
  })

  it('opens a draft that is ready', async () => {
    const steps = actions()
    render(<ChampionshipControls championshipId="ch1" status="draft" readiness={null} actions={steps} />)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir inscripción' }))
    await waitFor(() => expect(steps.open).toHaveBeenCalled())
    expect(vi.mocked(steps.open).mock.calls[0][1].get('championshipId')).toBe('ch1')
  })

  it('closes registration, and asks before cancelling', async () => {
    const steps = actions()
    render(<ChampionshipControls championshipId="ch1" status="registration" readiness={null} actions={steps} />)
    expect(screen.getByRole('button', { name: 'Cerrar inscripción' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar campeonato' }))
    const sheet = screen.getByRole('dialog', { name: 'Cancelar campeonato' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Sí, cancelar el campeonato' }))
    await waitFor(() => expect(steps.cancel).toHaveBeenCalled())
  })

  it('offers nothing once it is cancelled', () => {
    render(<ChampionshipControls championshipId="ch1" status="cancelled" readiness={null} actions={actions()} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

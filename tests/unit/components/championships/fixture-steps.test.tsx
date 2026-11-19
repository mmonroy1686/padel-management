import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FixtureSteps, type FixtureStepActions } from '@/components/championships/fixture-steps'
import type { FormAction } from '@/components/ui/action-form'

const ok = async () => ({ status: 'ok' as const, message: 'Listo.' })

function actions(): FixtureStepActions {
  return { draw: vi.fn<FormAction>(ok), schedule: vi.fn<FormAction>(ok), publish: vi.fn<FormAction>(ok), finish: vi.fn<FormAction>(ok) }
}

describe('FixtureSteps', () => {
  it('draws a championship with registration closed', async () => {
    const steps = actions()
    render(<FixtureSteps championshipId="ch1" status="closed" scheduled={0} unplaced={0} finishable={false} actions={steps} />)
    await userEvent.click(screen.getByRole('button', { name: 'Sortear' }))
    await waitFor(() => expect(steps.draw).toHaveBeenCalled())
    expect(vi.mocked(steps.draw).mock.calls[0][1].get('championshipId')).toBe('ch1')
  })

  it('schedules a drawn one, and does not publish while matches are left without a place', () => {
    render(<FixtureSteps championshipId="ch1" status="drawn" scheduled={20} unplaced={3} finishable={false} actions={actions()} />)
    expect(screen.getByText('3 partidos quedaron sin lugar: ubicalos a mano (Mover, en la tabla) o volvé a programar.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Volver a programar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Volver a sortear' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Publicar fixture' })).not.toBeInTheDocument()
  })

  it('publishes when every match has a place, giving back the free slots if asked', async () => {
    const steps = actions()
    render(<FixtureSteps championshipId="ch1" status="drawn" scheduled={23} unplaced={0} finishable={false} actions={steps} />)
    await userEvent.click(screen.getByLabelText('Devolver a la grilla las franjas sin partidos'))
    await userEvent.click(screen.getByRole('button', { name: 'Publicar fixture' }))
    await waitFor(() => expect(steps.publish).toHaveBeenCalled())
    expect(vi.mocked(steps.publish).mock.calls[0][1].get('releaseFree')).toBe('on')
  })

  it('shows where the organizer is: Sortear and Programar done, Publicar next, with its title', () => {
    render(<FixtureSteps championshipId="ch1" status="drawn" scheduled={23} unplaced={0} finishable={false} actions={actions()} />)
    const progress = screen.getByRole('list', { name: 'Pasos del fixture' })
    expect(progress).toHaveTextContent('SortearHecho')
    expect(progress).toHaveTextContent('ProgramarHecho')
    expect(screen.getByText('Publicar', { selector: '[aria-current="step"] *' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Siguiente paso: publicar el fixture' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Otras acciones' })).toHaveTextContent('Volver a programar')
  })

  it('finishes a championship when everything is played', () => {
    render(<FixtureSteps championshipId="ch1" status="in_progress" scheduled={23} unplaced={0} finishable actions={actions()} />)
    expect(screen.getByRole('button', { name: 'Finalizar campeonato' })).toBeInTheDocument()
  })
})

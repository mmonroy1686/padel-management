import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MatchDayBoard, type DayBoardActions } from '@/components/championships/match-day-board'
import type { FormAction } from '@/components/ui/action-form'
import { makeView } from '../../fixtures/championship-views'

const ok = async () => ({ status: 'ok' as const, message: 'Listo.' })
const RULES = { k1: { thirdSet: 'super_tiebreak' as const, timeLimit: null } }

function actions(): DayBoardActions {
  return { start: vi.fn<FormAction>(ok), result: vi.fn<FormAction>(ok), walkover: vi.fn<FormAction>(ok) }
}

describe('MatchDayBoard', () => {
  it('starts a match whose pairs are known, and lets the others wait', async () => {
    const steps = actions()
    render(
      <MatchDayBoard
        championshipId="ch1"
        playing={[]}
        upcoming={[
          makeView(),
          makeView({ id: 'f', name: 'Final', ready: false, entryA: null, entryB: null, sideA: '1° Zona A', sideB: '2° Zona A' }),
        ]}
        finished={[]}
        rules={RULES}
        actions={steps}
      />,
    )
    const upcoming = screen.getByRole('region', { name: 'Próximos' })
    expect(within(upcoming).getByText('Espera a sus parejas.')).toBeInTheDocument()
    await userEvent.click(within(upcoming).getByRole('button', { name: 'Empezar' }))
    await waitFor(() => expect(steps.start).toHaveBeenCalled())
    expect(vi.mocked(steps.start).mock.calls[0][1].get('matchId')).toBe('m1')
    expect(await screen.findByRole('status')).toHaveTextContent('Listo.')
  })

  it('records a result set by set', async () => {
    const steps = actions()
    render(
      <MatchDayBoard
        championshipId="ch1"
        playing={[makeView({ status: 'playing', statusLabel: 'En juego' })]}
        upcoming={[]}
        finished={[]}
        rules={RULES}
        actions={steps}
      />,
    )
    await userEvent.click(
      within(screen.getByRole('region', { name: 'En juego ahora' })).getByRole('button', { name: 'Cargar resultado' }),
    )
    const sheet = screen.getByRole('dialog', { name: 'Cargar resultado' })
    expect(
      within(sheet).getByText('Al mejor de 3 sets, con tie-break en 6-6. El tercer set es un súper tie-break a 10.'),
    ).toBeInTheDocument()
    await userEvent.type(within(sheet).getByLabelText('Set 1 · Ana y Pedro'), '6')
    await userEvent.type(within(sheet).getByLabelText('Set 1 · Bruno y Lucía'), '3')
    await userEvent.type(within(sheet).getByLabelText('Set 2 · Ana y Pedro'), '6')
    await userEvent.type(within(sheet).getByLabelText('Set 2 · Bruno y Lucía'), '4')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Guardar resultado' }))
    await waitFor(() => expect(steps.result).toHaveBeenCalled())
    const form = vi.mocked(steps.result).mock.calls[0][1]
    expect(['championshipId', 'matchId', 'a1', 'b1', 'a2', 'b2', 'a3'].map((key) => form.get(key))).toEqual([
      'ch1',
      'm1',
      '6',
      '3',
      '6',
      '4',
      '',
    ])
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('records a W.O. for the pair that did not show up', async () => {
    const steps = actions()
    render(<MatchDayBoard championshipId="ch1" playing={[]} upcoming={[makeView()]} finished={[]} rules={RULES} actions={steps} />)
    await userEvent.click(screen.getByRole('button', { name: 'W.O.' }))
    const sheet = screen.getByRole('dialog', { name: 'W.O.' })
    await userEvent.click(within(sheet).getByLabelText('Bruno y Lucía'))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Guardar W.O.' }))
    await waitFor(() => expect(steps.walkover).toHaveBeenCalled())
    expect(vi.mocked(steps.walkover).mock.calls[0][1].get('absentId')).toBe('e2')
  })

  it('corrects a result already saved, starting from its sets', async () => {
    render(
      <MatchDayBoard
        championshipId="ch1"
        playing={[]}
        upcoming={[]}
        finished={[
          makeView({
            status: 'finished',
            statusLabel: 'Terminado',
            score: '6-3 6-4',
            winner: 'a',
            sets: [
              { a: 6, b: 3, superTiebreak: false, inProgress: false },
              { a: 6, b: 4, superTiebreak: false, inProgress: false },
            ],
          }),
        ]}
        rules={RULES}
        actions={actions()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Corregir' }))
    expect(screen.getByLabelText('Set 2 · Bruno y Lucía')).toHaveValue(4)
  })
})

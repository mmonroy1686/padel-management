import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { FormAction } from '@/components/ui/action-form'
import { WaitSheet } from '@/components/waitlist/wait-sheet'
import { daySlots } from '@/lib/domain/slots'
import { waitRangeOptions } from '@/lib/domain/waitlist'
import { at, COURTS, DATE, SCHEDULE } from '../../fixtures/grid'

// Before the club opens: every slot of the day is ahead (08:00 ... 21:30).
const OPTIONS = waitRangeOptions(daySlots(SCHEDULE, DATE), at('07:00'))
const done = async () => ({ status: 'ok' as const, message: 'Listo, te anotamos.' })

function renderSheet(overrides: Partial<ComponentProps<typeof WaitSheet>> = {}) {
  const createAction = vi.fn<FormAction>(done)
  const cancelAction = vi.fn<FormAction>(done)
  const onDone = vi.fn()
  render(
    <WaitSheet
      open
      onClose={vi.fn()}
      date={DATE}
      dayText="jueves 1 de octubre"
      courts={COURTS}
      options={OPTIONS}
      initial={null}
      activeWaits={[]}
      createAction={createAction}
      cancelAction={cancelAction}
      onDone={onDone}
      {...overrides}
    />,
  )
  const sent = () => {
    const data = createAction.mock.calls[0][1]
    return { date: data.get('date'), fromTime: data.get('fromTime'), toTime: data.get('toTime'), courtIds: data.getAll('courtIds') }
  }
  return { createAction, cancelAction, onDone, sent }
}

describe('WaitSheet', () => {
  it('waits for the whole day on every court unless told otherwise', async () => {
    const { createAction, onDone, sent } = renderSheet()
    const dialog = screen.getByRole('dialog', { name: 'Avisame si se libera' })
    expect(within(dialog).getByLabelText('Desde')).toHaveValue('08:00')
    expect(within(dialog).getByLabelText('Hasta')).toHaveValue('23:00')
    expect(within(dialog).getByLabelText('Cancha 1')).toBeChecked()
    expect(within(dialog).getByLabelText('Cancha 2')).toBeChecked()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Anotarme' }))
    await waitFor(() => expect(createAction).toHaveBeenCalledTimes(1))
    expect(sent()).toEqual({ date: DATE, fromTime: '08:00', toTime: '23:00', courtIds: ['court-1', 'court-2'] })
    expect(onDone).toHaveBeenCalledWith('Listo, te anotamos.')
  })

  it('starts from the taken slot the player tapped, on that court', async () => {
    const { createAction, sent } = renderSheet({ initial: { fromTime: '18:30', toTime: '20:00', courtIds: ['court-2'] } })
    expect(screen.getByLabelText('Desde')).toHaveValue('18:30')
    expect(screen.getByLabelText('Hasta')).toHaveValue('20:00')
    expect(screen.getByLabelText('Cancha 1')).not.toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: 'Anotarme' }))
    await waitFor(() => expect(createAction).toHaveBeenCalledTimes(1))
    expect(sent()).toEqual({ date: DATE, fromTime: '18:30', toTime: '20:00', courtIds: ['court-2'] })
  })

  it('only offers ends after the start', async () => {
    renderSheet()
    await userEvent.selectOptions(screen.getByLabelText('Desde'), '20:00')
    const ends = within(screen.getByLabelText('Hasta')).getAllByRole('option').map((option) => option.textContent)
    expect(ends).toEqual(['21:30', '23:00'])
  })

  it('asks for at least one court', async () => {
    renderSheet()
    await userEvent.click(screen.getByLabelText('Cancha 1'))
    await userEvent.click(screen.getByLabelText('Cancha 2'))
    expect(screen.getByText('Marcá al menos una cancha.')).toBeInTheDocument()
  })

  it('with three waits already, offers to cancel one instead', async () => {
    const activeWaits = [
      { id: 'w1', text: 'sáb 3, de 18:30 a 21:30, cualquier cancha' },
      { id: 'w2', text: 'dom 4, de 08:00 a 12:30, Cancha 1' },
      { id: 'w3', text: 'lun 5, de 20:00 a 23:00, cualquier cancha' },
    ]
    const { cancelAction } = renderSheet({ activeWaits })
    expect(screen.getByText(/Ya estás esperando 3 turnos/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Anotarme' })).not.toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Cancelar espera' })[1])
    await waitFor(() => expect(cancelAction).toHaveBeenCalledTimes(1))
    expect(cancelAction.mock.calls[0][1].get('waitId')).toBe('w2')
  })

  it('says so when no slot is left that day', () => {
    renderSheet({ options: { from: [], to: [] } })
    expect(screen.getByText('Ya no quedan turnos por jugar este día.')).toBeInTheDocument()
  })
})

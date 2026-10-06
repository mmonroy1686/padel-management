import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { UnavailabilitySheet } from '@/components/championships/unavailability-sheet'
import type { FormAction } from '@/components/ui/action-form'
import { championshipBlocks } from '@/lib/domain/championships'
import { makeChampionship } from '../../fixtures/championships'

// Saturday 17 (08:00 to 14:00) and Sunday 18 (14:00 to 20:00): six blocks.
const BLOCKS = championshipBlocks(makeChampionship().windows)

function renderSheet(max: number | null) {
  const action = vi.fn<FormAction>(async () => ({ status: 'ok', message: 'Horarios guardados.' }))
  const onDone = vi.fn()
  render(
    <UnavailabilitySheet entryId="e1" blocks={BLOCKS} selected={['2026-10-17@08:00']} note="Trabajo" max={max} action={action}
      onClose={vi.fn()} onDone={onDone} />,
  )
  return { action, onDone, sheet: screen.getByRole('dialog', { name: 'Horarios imposibles' }) }
}

describe('UnavailabilitySheet', () => {
  it('marks the blocks of each day and saves them with a note', async () => {
    const { action, onDone, sheet } = renderSheet(2)
    const saturday = within(sheet).getByRole('group', { name: 'sábado 17 de octubre' })
    expect(within(saturday).getByRole('checkbox', { name: '08:00 a 10:00' })).toBeChecked()
    expect(within(sheet).getByText(/Hasta 2 de 6/)).toBeInTheDocument()
    const sunday = within(sheet).getByRole('group', { name: 'domingo 18 de octubre' })
    await userEvent.click(within(sunday).getByRole('checkbox', { name: '18:00 a 20:00' }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Guardar horarios' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('Horarios guardados.'))
    const sent = action.mock.calls[0][1]
    expect(sent.get('entryId')).toBe('e1')
    expect(sent.getAll('blocks')).toEqual(['2026-10-17@08:00', '2026-10-18@18:00'])
    expect(sent.get('note')).toBe('Trabajo')
  })

  it('warns a player who marks more than she can', async () => {
    const { sheet } = renderSheet(1)
    await userEvent.click(within(sheet).getByRole('checkbox', { name: '10:00 a 12:00' }))
    expect(within(sheet).getByRole('note')).toHaveTextContent('Marcaste 2: más de las 1 que se pueden sin pedirle al club.')
  })

  it('lets staff mark more than 40 %', () => {
    const { sheet } = renderSheet(null)
    expect(within(sheet).getByText(/Son 6 franjas/)).toBeInTheDocument()
  })
})

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChampionshipDetailsForm } from '@/components/championships/championship-details-form'
import type { FormAction } from '@/components/ui/action-form'

describe('ChampionshipDetailsForm', () => {
  it('creates a championship with what was typed', async () => {
    const action = vi.fn<FormAction>(async () => ({ status: 'ok', message: 'Listo.' }))
    render(<ChampionshipDetailsForm action={action} submitLabel="Crear campeonato" pendingLabel="Creando…" today="2026-10-06" />)
    expect(screen.getByLabelText('Categorías por jugador')).toHaveValue('2')
    expect(screen.getByText('Sin cierre, la inscripción cierra 24 horas antes del primer partido.')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Nombre'), 'Primavera')
    await userEvent.type(screen.getByLabelText('Reglamento'), 'Al mejor de 3 sets.')
    await userEvent.selectOptions(screen.getByLabelText('Categorías por jugador'), '3')
    await userEvent.click(screen.getByRole('button', { name: 'Crear campeonato' }))
    await waitFor(() => expect(action).toHaveBeenCalled())
    expect(Object.fromEntries(action.mock.calls[0][1].entries())).toEqual({
      name: 'Primavera',
      rules: 'Al mejor de 3 sets.',
      maxCategories: '3',
      closesDate: '',
      closesTime: '',
    })
  })

  it('edits a championship starting from what it has', async () => {
    const action = vi.fn<FormAction>(async () => ({ status: 'ok', message: 'Datos guardados.' }))
    render(
      <ChampionshipDetailsForm
        action={action}
        submitLabel="Guardar datos"
        pendingLabel="Guardando…"
        today="2026-10-06"
        details={{ id: 'ch1', name: 'Primavera', rules: '', maxCategories: 1, closesDate: '2026-10-16', closesTime: '08:00' }}
      />,
    )
    expect(screen.getByLabelText('Nombre')).toHaveValue('Primavera')
    expect(screen.getByLabelText('Hora del cierre')).toHaveValue('08:00')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar datos' }))
    await waitFor(() => expect(action).toHaveBeenCalled())
    expect(action.mock.calls[0][1].get('championshipId')).toBe('ch1')
    expect(await screen.findByRole('status')).toHaveTextContent('Datos guardados.')
  })
})

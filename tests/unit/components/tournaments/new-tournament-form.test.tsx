import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NewTournamentForm } from '@/components/tournaments/new-tournament-form'
import type { FormAction } from '@/components/ui/action-form'
import { at, TIMEZONE } from '../../fixtures/grid'

const COURTS = [
  { id: 'c1', name: 'Cancha 1' },
  { id: 'c2', name: 'Cancha 2' },
]

function renderForm() {
  const action = vi.fn<FormAction>(async () => ({ status: 'idle' as const }))
  render(
    <NewTournamentForm
      courts={COURTS}
      times={['08:00', '18:00', '21:30']}
      today="2026-10-01"
      timezone={TIMEZONE}
      opensAt="08:00:00"
      closesAt="23:00:00"
      taken={[{ courtId: 'c1', startsAt: at('19:00'), endsAt: at('20:30') }]}
      action={action}
    />,
  )
  return action
}

describe('NewTournamentForm', () => {
  it('proposes 8 players, 24 points, 20 minutes, 7 rounds and $400 on the first two courts', () => {
    renderForm()
    expect(screen.getByLabelText('Jugadores')).toHaveValue('8')
    expect(screen.getByLabelText('Puntos por partido')).toHaveValue(24)
    expect(screen.getByLabelText('Minutos por ronda')).toHaveValue(20)
    expect(screen.getByLabelText('Rondas')).toHaveValue(7)
    expect(screen.getByLabelText('Precio por jugador')).toHaveValue(400)
    expect(screen.getByLabelText('Cancha 1')).toBeChecked()
    expect(screen.getByLabelText('Cancha 2')).toBeChecked()
  })

  it('says when it ends and warns about taken courts before saving', () => {
    renderForm()
    expect(screen.getByRole('note')).toHaveTextContent('Termina a las 20:20')
    expect(screen.getByRole('note')).toHaveTextContent('Cancha 1 ya tiene algo a esa hora.')
  })

  it('updates the end and the warnings as the choices change', async () => {
    renderForm()
    await userEvent.selectOptions(screen.getByLabelText('Hora'), '08:00')
    expect(screen.getByRole('note')).toHaveTextContent('Termina a las 10:20')
    expect(screen.getByRole('note')).not.toHaveTextContent('ya tiene')
    await userEvent.selectOptions(screen.getByLabelText('Jugadores'), '12')
    expect(screen.getByRole('note')).toHaveTextContent('Termina a las 12:40')
    await userEvent.click(screen.getByLabelText('Cancha 2'))
    expect(screen.getByRole('note')).toHaveTextContent('Termina a las 15:00')
    await userEvent.selectOptions(screen.getByLabelText('Hora'), '21:30')
    expect(screen.getByRole('note')).toHaveTextContent('Queda fuera del horario del club.')
  })

  it('checks the warnings again on another day', () => {
    renderForm()
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-10-02' } })
    expect(screen.getByRole('note')).not.toHaveTextContent('ya tiene')
  })

  it('sends every field to the action', async () => {
    const action = renderForm()
    await userEvent.type(screen.getByLabelText('Nombre'), 'Americano de octubre')
    await userEvent.click(screen.getByRole('button', { name: 'Crear americano' }))
    await waitFor(() => expect(action).toHaveBeenCalled())
    const form = action.mock.calls[0][1]
    expect(form.get('name')).toBe('Americano de octubre')
    expect(form.get('date')).toBe('2026-10-01')
    expect(form.get('time')).toBe('18:00')
    expect(form.getAll('courtIds')).toEqual(['c1', 'c2'])
    expect(form.get('maxPlayers')).toBe('8')
    expect(form.get('type')).toBe('mixed')
  })
})

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PlayerProfileForm, type ProfileValues } from '@/components/profile/player-profile-form'
import type { FormAction } from '@/components/ui/action-form'

const NEW_PLAYER: ProfileValues = { displayName: 'Lucía', side: null, hand: null, category: null, isPublic: true }

describe('PlayerProfileForm', () => {
  it('asks for name, side, hand and category when joining', () => {
    render(<PlayerProfileForm mode="onboarding" action={vi.fn<FormAction>()} initial={NEW_PLAYER} next="/reservar" />)
    expect(screen.getByLabelText('Nombre')).toHaveValue('Lucía')
    expect(screen.getByLabelText('Lado')).toBeRequired()
    expect(screen.getByLabelText('Mano')).toBeRequired()
    expect(screen.getByLabelText('Categoría')).toBeRequired()
    expect(screen.getByText(/El club valida tu categoría/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar y seguir' })).toBeInTheDocument()
  })

  it('sends the choices and where to go next', async () => {
    const action = vi.fn<FormAction>(async () => ({ status: 'ok', message: '' }))
    render(<PlayerProfileForm mode="onboarding" action={action} initial={NEW_PLAYER} next="/reservar" />)
    await userEvent.selectOptions(screen.getByLabelText('Lado'), 'Revés')
    await userEvent.selectOptions(screen.getByLabelText('Mano'), 'Zurdo')
    await userEvent.selectOptions(screen.getByLabelText('Categoría'), '5ª')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y seguir' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect(Object.fromEntries(action.mock.calls[0][1].entries())).toMatchObject({
      displayName: 'Lucía',
      side: 'backhand',
      hand: 'left',
      category: '5',
      next: '/reservar',
      isPublic: 'on',
    })
  })

  it('lets a player choose who sees her profile later on', () => {
    render(
      <PlayerProfileForm
        mode="profile"
        action={vi.fn<FormAction>()}
        initial={{ displayName: 'Lucía', side: 'drive', hand: 'right', category: 5, isPublic: false }}
      />,
    )
    expect(screen.getByLabelText('Otros jugadores pueden ver mi perfil')).not.toBeChecked()
    expect(screen.getByText(/el club la vuelve a validar/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument()
  })
})

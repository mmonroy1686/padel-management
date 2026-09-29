import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import type { ActionState } from '@/lib/actions/result'

function actionReturning(result: ActionState) {
  return vi.fn<FormAction>(async () => result)
}

describe('ActionForm', () => {
  it('sends its fields to the action', async () => {
    const action = actionReturning({ status: 'ok', message: 'Hecho' })
    render(
      <ActionForm action={action} submitLabel="Guardar">
        <input type="hidden" name="bookingId" value="b1" />
      </ActionForm>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect(action.mock.calls[0][1].get('bookingId')).toBe('b1')
  })

  it('shows an error in place and keeps the form', async () => {
    render(<ActionForm action={actionReturning({ status: 'error', message: 'Esa cancha se acaba de ocupar.' })} submitLabel="Reservar" />)
    await userEvent.click(screen.getByRole('button', { name: 'Reservar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Esa cancha se acaba de ocupar.')
    expect(screen.getByRole('button', { name: 'Reservar' })).toBeEnabled()
  })

  it('hands a success to onDone', async () => {
    const onDone = vi.fn()
    render(<ActionForm action={actionReturning({ status: 'ok', message: 'Reservado' })} submitLabel="Reservar" onDone={onDone} />)
    await userEvent.click(screen.getByRole('button', { name: 'Reservar' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('Reservado'))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows a success itself when nobody handles it', async () => {
    render(<ActionForm action={actionReturning({ status: 'ok', message: 'Guardamos tus cambios.' })} submitLabel="Guardar" />)
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Guardamos tus cambios.')
  })
})

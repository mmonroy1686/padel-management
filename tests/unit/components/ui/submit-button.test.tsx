import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ActivityProvider } from '@/components/ui/activity'
import { SubmitButton } from '@/components/ui/submit-button'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => (resolve = done))
  return { promise, resolve }
}

describe('SubmitButton', () => {
  it('shows a spinner and the top loading bar while its form action runs', async () => {
    const running = deferred()
    render(
      <ActivityProvider>
        <form action={() => running.promise}>
          <SubmitButton label="Guardar" pendingLabel="Guardando…" />
        </form>
      </ActivityProvider>,
    )
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    const button = await screen.findByRole('button', { name: 'Guardando…' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button.querySelector('svg[data-spinner]')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Cargando' })).toBeInTheDocument()

    running.resolve()
    expect(await screen.findByRole('button', { name: 'Guardar' })).toBeEnabled()
    await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument())
  })

  it('follows a pending state given by the form', () => {
    render(
      <ActivityProvider>
        <form>
          <SubmitButton label="Enviar" pendingLabel="Enviando…" pending />
        </form>
      </ActivityProvider>,
    )
    expect(screen.getByRole('button', { name: 'Enviando…' })).toBeDisabled()
    expect(screen.getByRole('progressbar', { name: 'Cargando' })).toBeInTheDocument()
  })

  it('works without the provider', () => {
    render(
      <form>
        <SubmitButton label="Enviar" pending />
      </form>,
    )
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled()
  })
})

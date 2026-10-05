import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FormAction } from '@/components/ui/action-form'
import { HoldBanner } from '@/components/waitlist/hold-banner'

const EXPIRES = new Date('2026-10-03T20:42:00Z')
const done = async () => ({ status: 'ok' as const, message: 'Listo.' })

function renderBanner(expiresAt: Date = EXPIRES) {
  const claimAction = vi.fn<FormAction>(done)
  const declineAction = vi.fn<FormAction>(done)
  render(
    <HoldBanner
      holdId="h1"
      text="Se liberó la Cancha 2, sáb 3 a las 19:00."
      expiresAt={expiresAt.toISOString()}
      price={1600}
      paymentNote="Pagás en efectivo o por transferencia."
      claimAction={claimAction}
      declineAction={declineAction}
    />,
  )
  return { claimAction, declineAction }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('HoldBanner', () => {
  it('counts down the time left', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(EXPIRES.getTime() - 754_000))
    renderBanner()
    expect(screen.getByRole('region', { name: 'Turno retenido' })).toHaveTextContent('Se liberó la Cancha 2, sáb 3 a las 19:00.')
    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(screen.getByTestId('hold-countdown')).toHaveTextContent('12:34')
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByTestId('hold-countdown')).toHaveTextContent('12:33')
  })

  it('says so when the time ran out, without the buttons', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(EXPIRES.getTime() - 500))
    renderBanner()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText('Se terminó el tiempo: el turno pasó al siguiente de la lista.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reservar' })).not.toBeInTheDocument()
  })

  it('books after showing the price and how to pay', async () => {
    const { claimAction } = renderBanner(new Date(Date.now() + 600_000))
    await userEvent.click(screen.getByRole('button', { name: 'Reservar' }))
    const dialog = screen.getByRole('dialog', { name: 'Reservar turno' })
    expect(dialog).toHaveTextContent('$1.600')
    expect(dialog).toHaveTextContent('Pagás en efectivo o por transferencia.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar reserva' }))
    await waitFor(() => expect(claimAction).toHaveBeenCalledTimes(1))
    expect(claimAction.mock.calls[0][1].get('holdId')).toBe('h1')
  })

  it('passes it on to the next in line', async () => {
    const { declineAction } = renderBanner(new Date(Date.now() + 600_000))
    await userEvent.click(screen.getByRole('button', { name: 'No me sirve' }))
    await waitFor(() => expect(declineAction).toHaveBeenCalledTimes(1))
    expect(declineAction.mock.calls[0][1].get('holdId')).toBe('h1')
  })
})

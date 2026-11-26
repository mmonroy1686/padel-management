import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { MagicLinkState, SignInCodeState } from '@/app/auth/ingreso/actions'

vi.mock('@/app/auth/ingreso/actions', () => ({ sendMagicLink: vi.fn(), verifySignInCode: vi.fn() }))

const { EmailSignIn } = await import('@/app/auth/ingreso/email-sign-in')

const sentTo = (email: string) => vi.fn(async (): Promise<MagicLinkState> => ({ status: 'sent', email }))

async function askForCode(sendAction = sentTo('ana@club.uy'), verifyAction = vi.fn(async (): Promise<SignInCodeState> => ({ status: 'idle' }))) {
  render(<EmailSignIn next="/reservar" sendAction={sendAction} verifyAction={verifyAction} />)
  await userEvent.type(screen.getByLabelText('Email'), 'ana@club.uy')
  await userEvent.click(screen.getByRole('button', { name: 'Mandarme un código' }))
  return { sendAction, verifyAction }
}

describe('EmailSignIn', () => {
  it('after the mail goes out, asks for the code on the same screen', async () => {
    await askForCode()
    expect(await screen.findByRole('status')).toHaveTextContent('Te mandamos un mail a ana@club.uy')
    expect(screen.getByLabelText('Código del mail')).toHaveAttribute('autocomplete', 'one-time-code')
  })

  it('goes in by itself once the six digits are there', async () => {
    const { verifyAction } = await askForCode()
    await userEvent.type(await screen.findByLabelText('Código del mail'), '123456')
    expect(verifyAction).toHaveBeenCalledTimes(1)
    const form = verifyAction.mock.calls[0] as unknown as [SignInCodeState, FormData]
    expect(form[1].get('code')).toBe('123456')
    expect(form[1].get('email')).toBe('ana@club.uy')
    expect(form[1].get('next')).toBe('/reservar')
  })

  it('shows why the code did not work', async () => {
    const verifyAction = vi.fn(async (): Promise<SignInCodeState> => ({ status: 'error', message: 'El código no es correcto o venció. Revisalo o pedí otro.' }))
    await askForCode(undefined, verifyAction)
    await userEvent.type(await screen.findByLabelText('Código del mail'), '000000')
    expect(await screen.findByRole('alert')).toHaveTextContent('no es correcto o venció')
  })

  it('sends another code, and starts over with another email', async () => {
    const { sendAction } = await askForCode()
    await userEvent.click(await screen.findByRole('button', { name: 'Mandar otro código' }))
    expect(await screen.findByText('Te mandamos otro código. El anterior ya no sirve.')).toBeInTheDocument()
    expect(sendAction).toHaveBeenCalledTimes(2)
    await userEvent.click(screen.getByRole('button', { name: 'Usar otro email' }))
    expect(screen.getByLabelText('Email')).toHaveValue('')
  })
})

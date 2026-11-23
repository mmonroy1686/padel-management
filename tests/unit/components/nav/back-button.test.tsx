import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BackButton } from '@/components/nav/back-button'

const back = vi.fn()
let pathname = '/club/inicio'
vi.mock('next/navigation', () => ({ useRouter: () => ({ back }), usePathname: () => pathname }))

describe('BackButton', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    back.mockClear()
    pathname = '/club/inicio'
  })

  it('hides on the first screen of the visit', () => {
    render(<BackButton />)
    expect(screen.queryByRole('button', { name: 'Volver' })).not.toBeInTheDocument()
  })

  it('goes back to the screen before, inside the app', async () => {
    const { rerender } = render(<BackButton />)
    pathname = '/club/cobros'
    rerender(<BackButton />)
    await userEvent.click(await screen.findByRole('button', { name: 'Volver' }))
    expect(back).toHaveBeenCalledOnce()
  })
})

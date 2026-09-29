import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button, buttonClasses } from '@/components/ui/button'

describe('Button', () => {
  it('defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>Reservar</Button>)
    expect(screen.getByRole('button', { name: 'Reservar' })).toHaveAttribute('type', 'button')
  })

  it('keeps the 44px minimum touch target in every variant', () => {
    for (const variant of ['primary', 'secondary', 'ghost'] as const) {
      expect(buttonClasses({ variant })).toContain('min-h-11')
    }
  })

  it('uses amber with black text for the primary action', () => {
    render(<Button>Reservar</Button>)
    expect(screen.getByRole('button')).toHaveClass('bg-accent', 'text-on-accent')
  })

  it('calls onClick, and not when disabled', async () => {
    const onClick = vi.fn()
    const { rerender } = render(<Button onClick={onClick}>Reservar</Button>)
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)

    rerender(<Button onClick={onClick} disabled>Reservar</Button>)
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('stretches with fullWidth and keeps extra classes', () => {
    render(<Button fullWidth className="mt-4">Reservar</Button>)
    expect(screen.getByRole('button')).toHaveClass('w-full', 'mt-4')
  })
})

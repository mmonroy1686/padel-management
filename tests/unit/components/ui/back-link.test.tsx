import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BackLink } from '@/components/ui/back-link'

describe('BackLink', () => {
  it('goes back with a tap area of 44 px', () => {
    render(<BackLink href="/torneos">Volver a torneos</BackLink>)
    const link = screen.getByRole('link', { name: 'Volver a torneos' })
    expect(link).toHaveAttribute('href', '/torneos')
    expect(link).toHaveClass('min-h-11')
  })
})

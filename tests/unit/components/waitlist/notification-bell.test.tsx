import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NotificationBell } from '@/components/waitlist/notification-bell'

describe('NotificationBell', () => {
  it('leads to Avisos and says how many are unread', () => {
    render(<NotificationBell unread={2} />)
    const bell = screen.getByRole('link', { name: 'Avisos, 2 sin leer' })
    expect(bell).toHaveAttribute('href', '/avisos')
    expect(bell).toHaveTextContent('2')
  })

  it('has no badge when everything was read, and caps it at 9+', () => {
    const { rerender } = render(<NotificationBell unread={0} />)
    expect(screen.getByRole('link', { name: 'Avisos' }).querySelector('span')).toBeNull()
    rerender(<NotificationBell unread={12} />)
    expect(screen.getByRole('link', { name: 'Avisos, 12 sin leer' })).toHaveTextContent('9+')
  })
})

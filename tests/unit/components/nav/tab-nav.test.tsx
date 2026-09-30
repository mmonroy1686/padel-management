import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { isCurrent, TabNav, type TabItem } from '@/components/nav/tab-nav'

vi.mock('next/navigation', () => ({ usePathname: () => '/reservas' }))

const ITEMS: TabItem[] = [
  { href: '/', label: 'Inicio', icon: 'home' },
  { href: '/reservas', label: 'Mis reservas', icon: 'ticket' },
]

describe('TabNav', () => {
  it('is a named navigation landmark', () => {
    render(<TabNav label="Secciones" items={ITEMS} variant="bottom" />)
    expect(screen.getByRole('navigation', { name: 'Secciones' })).toBeInTheDocument()
  })

  it('marks the current section', () => {
    render(<TabNav label="Secciones" items={ITEMS} variant="bottom" />)
    expect(screen.getByRole('link', { name: 'Mis reservas' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Inicio' })).not.toHaveAttribute('aria-current')
  })

  it('shows each section with its icon', () => {
    render(<TabNav label="Secciones" items={ITEMS} variant="bottom" />)
    const link = screen.getByRole('link', { name: 'Inicio' })
    expect(link.querySelector('svg[data-icon="home"]')).toHaveAttribute('aria-hidden', 'true')
  })

  it('matches nested paths but keeps the home tab exact', () => {
    expect(isCurrent('/club/grilla', '/club/grilla')).toBe(true)
    expect(isCurrent('/reservas/algo', '/reservas')).toBe(true)
    expect(isCurrent('/reservar', '/')).toBe(false)
    expect(isCurrent('/reservar', '/reservas')).toBe(false)
  })
})

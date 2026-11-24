import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SettingsNav } from '@/components/settings/settings-nav'

const nav = vi.hoisted(() => ({ pathname: '/club/ajustes/pagos' }))
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }))

describe('SettingsNav', () => {
  it('links every section and marks the current one', () => {
    render(<SettingsNav />)
    const menu = screen.getByRole('navigation', { name: 'Secciones de ajustes' })
    expect(menu.querySelectorAll('a')).toHaveLength(7)
    expect(screen.getByRole('link', { name: 'Pagos' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Club' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'Canchas y precios' })).toHaveAttribute('href', '/club/ajustes/canchas')
  })

  it('marks Club only on its own page', () => {
    nav.pathname = '/club/ajustes'
    render(<SettingsNav />)
    expect(screen.getByRole('link', { name: 'Club' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getAllByRole('link').filter((link) => link.getAttribute('aria-current'))).toHaveLength(1)
  })
})

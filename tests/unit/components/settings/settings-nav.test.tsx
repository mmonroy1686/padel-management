import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SettingsFrame } from '@/components/settings/settings-nav'

const nav = vi.hoisted(() => ({ pathname: '/club/ajustes/pagos' }))
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }))

describe('SettingsFrame', () => {
  it('around a section: the sidebar with every section, the current one marked, and the way back to the index', () => {
    nav.pathname = '/club/ajustes/pagos'
    render(<SettingsFrame>Pagos</SettingsFrame>)
    const menu = screen.getByRole('navigation', { name: 'Secciones de ajustes', hidden: true })
    // Monitoreo is for the platform admin only.
    expect(menu.querySelectorAll('a')).toHaveLength(8)
    expect(screen.getByRole('link', { name: 'Pagos', hidden: true })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Club', hidden: true })).toHaveAttribute('href', '/club/ajustes/club')
    expect(screen.getByRole('link', { name: 'Ajustes' })).toHaveAttribute('href', '/club/ajustes')
  })

  it('the index goes without them: it is already the menu', () => {
    nav.pathname = '/club/ajustes'
    render(<SettingsFrame>Índice</SettingsFrame>)
    expect(screen.queryByRole('navigation', { hidden: true })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Ajustes' })).not.toBeInTheDocument()
  })
})

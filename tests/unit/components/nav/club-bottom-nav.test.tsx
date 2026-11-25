import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClubBottomNav } from '@/components/nav/club-bottom-nav'
import { clubBarTabs, clubMoreTabs } from '@/lib/club/tabs'

const path = vi.hoisted(() => ({ value: '/club/inicio' }))
vi.mock('next/navigation', () => ({ usePathname: () => path.value }))

beforeEach(() => {
  path.value = '/club/inicio'
})

function renderNav(role: 'admin' | 'reception' = 'reception') {
  return render(<ClubBottomNav bar={clubBarTabs(role)} more={clubMoreTabs(role)} />)
}

describe('ClubBottomNav', () => {
  it('has the four sections of the day and «Más», marking where you are', () => {
    renderNav()
    const nav = screen.getByRole('navigation', { name: 'Panel' })
    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(['Inicio', 'Grilla', 'Cobros', 'Jugadores'])
    expect(within(nav).getByRole('link', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('button', { name: 'Más' })).toBeInTheDocument()
  })

  it('opens the other sections and the way back to the app from «Más»', async () => {
    renderNav('admin')
    await userEvent.click(screen.getByRole('button', { name: 'Más' }))
    const sheet = screen.getByRole('dialog', { name: 'Más' })
    expect(within(sheet).getByRole('link', { name: /^Torneos/ })).toHaveAttribute('href', '/club/torneos')
    expect(within(sheet).getByRole('link', { name: /^Jugadores/ })).toHaveAttribute('href', '/club/jugadores')
    expect(within(sheet).getByRole('link', { name: 'Ir a la app de jugadores' })).toHaveAttribute('href', '/')
  })

  it('lights «Más» on a section that lives there, and closes it after going somewhere', async () => {
    const { rerender } = renderNav()
    await userEvent.click(screen.getByRole('button', { name: 'Más' }))
    expect(screen.getByRole('dialog', { name: 'Más' })).toBeInTheDocument()
    path.value = '/club/torneos'
    rerender(<ClubBottomNav bar={clubBarTabs('reception')} more={clubMoreTabs('reception')} />)
    expect(screen.getByRole('button', { name: 'Más' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: 'Más' }).className).toContain('text-accent-ink')
  })
})

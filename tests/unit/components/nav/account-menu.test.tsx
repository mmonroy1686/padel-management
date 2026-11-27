import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AccountMenu } from '@/components/nav/account-menu'

vi.mock('@/lib/actions/profile', () => ({ signOut: vi.fn() }))
vi.mock('@/lib/supabase/env', () => ({ getSupabaseEnv: () => ({ url: 'https://x.supabase.co', publishableKey: 'k' }) }))

const profile = { avatar_source: null, avatar_path: null, avatar_url: null }

function renderMenu() {
  return render(
    <AccountMenu
      name="Ana Pérez"
      profile={profile}
      links={[
        { href: '/perfil', label: 'Tu perfil' },
        { href: '/club/inicio', label: 'Panel del club' },
      ]}
    />,
  )
}

describe('AccountMenu', () => {
  it('opens from the photo with the links and «Cerrar sesión» last', async () => {
    renderMenu()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Tu cuenta' }))
    const items = screen.getAllByRole('menuitem')
    expect(items.map((item) => item.textContent)).toEqual(['Tu perfil', 'Panel del club', 'Cerrar sesión'])
    expect(items[1]).toHaveAttribute('href', '/club/inicio')
    expect(screen.getByRole('menu')).toHaveTextContent('Ana Pérez')
    expect(items[0]).toHaveFocus()
  })

  it('moves with the arrows and closes with Escape, back on the photo', async () => {
    renderMenu()
    const trigger = screen.getByRole('button', { name: 'Tu cuenta' })
    await userEvent.click(trigger)
    await userEvent.keyboard('{ArrowUp}')
    expect(screen.getByRole('menuitem', { name: 'Cerrar sesión' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('closes on a click outside', async () => {
    renderMenu()
    await userEvent.click(screen.getByRole('button', { name: 'Tu cuenta' }))
    await userEvent.click(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

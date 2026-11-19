import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ActionsMenu } from '@/components/ui/actions-menu'

function renderMenu() {
  const hours = vi.fn()
  const remove = vi.fn()
  render(
    <ActionsMenu
      label="Acciones de Ana y Pedro"
      items={[
        { label: 'Quitar', onSelect: remove, danger: true },
        { label: 'Horarios', onSelect: hours },
      ]}
    />,
  )
  return { hours, remove }
}

describe('ActionsMenu', () => {
  it('opens a menu with the danger item last, and runs the one picked', async () => {
    const { hours } = renderMenu()
    const trigger = screen.getByRole('button', { name: 'Acciones de Ana y Pedro' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Horarios', 'Quitar'])
    expect(screen.getByRole('menuitem', { name: 'Horarios' })).toHaveFocus()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Horarios' }))
    expect(hours).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('moves with the arrows and closes with Escape, back on the button', async () => {
    renderMenu()
    const trigger = screen.getByRole('button', { name: 'Acciones de Ana y Pedro' })
    await userEvent.click(trigger)
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Quitar' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { MemberPicker } from '@/components/ui/member-picker'

const MEMBERS = [
  { userId: 'u-agustin', name: 'Agustín Correa' },
  { userId: 'u-ana', name: 'Ana Pérez' },
  { userId: 'u-andrea', name: 'Andrea Morales' },
  { userId: 'u-bruno', name: 'Bruno Olivera' },
]

function renderPicker() {
  render(
    <form>
      <label htmlFor="playerId">Jugador</label>
      <MemberPicker id="playerId" name="playerId" members={MEMBERS} />
    </form>,
  )
  return {
    input: screen.getByRole('combobox', { name: 'Jugador' }),
    value: () => (document.querySelector('input[name="playerId"]') as HTMLInputElement).value,
  }
}

describe('MemberPicker', () => {
  it('filters the members by name as reception types, ignoring accents and case', async () => {
    const { input } = renderPicker()
    await userEvent.type(input, 'agus')
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Agustín Correa'])
    await userEvent.clear(input)
    await userEvent.type(input, 'mor')
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Andrea Morales'])
  })

  it('picks a member with a tap and sends their id', async () => {
    const { input, value } = renderPicker()
    await userEvent.type(input, 'an')
    await userEvent.click(screen.getByRole('option', { name: 'Ana Pérez' }))
    expect(input).toHaveValue('Ana Pérez')
    expect(value()).toBe('u-ana')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('works with the keyboard', async () => {
    const { input, value } = renderPicker()
    await userEvent.type(input, 'an{ArrowDown}{ArrowDown}{Enter}')
    expect(value()).toBe('u-andrea')
  })

  it('forgets the pick when the name is edited, and says when nobody matches', async () => {
    const { input, value } = renderPicker()
    await userEvent.type(input, 'bru{Enter}')
    expect(value()).toBe('u-bruno')
    await userEvent.type(input, 'x')
    expect(value()).toBe('')
    expect(screen.getByText('Nadie con ese nombre.')).toBeInTheDocument()
  })

  it('asks to pick someone from the list before the form is sent', () => {
    const { input } = renderPicker()
    expect(input).toBeInvalid()
  })
})

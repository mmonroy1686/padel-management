import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { PlayerNameField } from '@/components/club/player-name-field'

const MEMBERS = [
  { userId: 'u1', name: 'Martín López' },
  { userId: 'u2', name: 'Lucía Pérez' },
]

function renderField(initial: { playerId: string | null; name: string | null } = { playerId: null, name: null }) {
  const { container } = render(
    <form aria-label="Jugadores">
      <label htmlFor="p3">Jugador 3</label>
      <PlayerNameField id="p3" position={3} members={MEMBERS} initial={initial} />
    </form>,
  )
  const form = container.querySelector('form')!
  return { values: () => Object.fromEntries(new FormData(form).entries()) }
}

describe('PlayerNameField', () => {
  it('picks a member from the list', async () => {
    const { values } = renderField()
    await userEvent.type(screen.getByRole('combobox', { name: 'Jugador 3' }), 'martin')
    await userEvent.click(screen.getByRole('option', { name: 'Martín López' }))
    expect(values()).toEqual({ player3Id: 'u1', player3Name: '' })
    expect(screen.getByText('Socio del club.')).toBeInTheDocument()
  })

  it('keeps a typed name of someone without an account', async () => {
    const { values } = renderField()
    await userEvent.type(screen.getByRole('combobox', { name: 'Jugador 3' }), ' Pepe ')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(values()).toEqual({ player3Id: '', player3Name: 'Pepe' })
    expect(screen.getByText('Sin cuenta: queda solo el nombre.')).toBeInTheDocument()
  })

  it('stops being the member once the text changes', async () => {
    const { values } = renderField({ playerId: 'u2', name: 'Lucía Pérez' })
    expect(values()).toEqual({ player3Id: 'u2', player3Name: '' })
    await userEvent.type(screen.getByRole('combobox', { name: 'Jugador 3' }), 'x')
    expect(values()).toEqual({ player3Id: '', player3Name: 'Lucía Pérezx' })
  })

  it('starts empty: nobody yet', () => {
    const { values } = renderField()
    expect(values()).toEqual({ player3Id: '', player3Name: '' })
    expect(screen.getByText('Sin nombre por ahora.')).toBeInTheDocument()
  })
})

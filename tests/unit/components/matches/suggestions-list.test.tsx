import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SuggestionsList } from '@/components/matches/suggestions-list'

describe('SuggestionsList', () => {
  it('shows each suggestion with its reasons and a WhatsApp invite', () => {
    render(
      <SuggestionsList
        shareText="Falta 1"
        suggestions={[{ playerId: 'b', name: 'Bruno Díaz', score: 50, chips: [{ text: 'Juega de revés', hit: true }] }]}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Invitá a quien le puede servir' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Por qué Bruno Díaz' })).toHaveTextContent('Juega de revés')
    expect(screen.getByRole('link', { name: 'Invitar a Bruno Díaz por WhatsApp' }).getAttribute('href')).toContain(
      encodeURIComponent('Hola Bruno!'),
    )
  })

  it('suggests sharing in the group when nobody fits', () => {
    render(<SuggestionsList shareText="Falta 1" suggestions={[]} />)
    expect(screen.getByText(/Compartilo en el grupo del club/)).toBeInTheDocument()
  })
})

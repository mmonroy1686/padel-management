import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { PublicBoard, type PublicCategory } from '@/app/c/[code]/public-board'
import { makeView, makeZone } from '../../fixtures/championship-views'

const LIBRE: PublicCategory = {
  id: 'k1',
  name: '6ta Libre',
  rules: 'Al mejor de 3 sets, sin límite de tiempo · Tercer set: súper tie-break a 10',
  zones: [makeZone()],
  bracket: null,
  days: [{ key: '2026-10-17', label: 'Sábado 17 de octubre', matches: [makeView()] }],
}
const DAMAS: PublicCategory = { ...LIBRE, id: 'k2', name: '5ta Damas', zones: [makeZone({ id: 'g2', name: 'Zona B' })] }

describe('PublicBoard', () => {
  it('shows each category in its tab: groups, bracket and matches by day', async () => {
    render(
      <PublicBoard
        name="Campeonato de Primavera"
        subtitle="Del sábado 17 de octubre al domingo 18 de octubre · En juego"
        categories={[LIBRE, DAMAS]}
        shareText="Seguí el Campeonato de Primavera en vivo: https://rustic.uy/c/primavera-7k2f"
        tvHref="/c/primavera-7k2f/tv"
      />,
    )
    expect(screen.getByRole('heading', { name: 'Campeonato de Primavera', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '6ta Libre' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Zona A')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Sábado 17 de octubre')
    await userEvent.click(screen.getByRole('tab', { name: '5ta Damas' }))
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Zona B')
    expect(screen.getByRole('link', { name: 'Modo TV' })).toHaveAttribute('href', '/c/primavera-7k2f/tv')
    expect(screen.getByRole('button', { name: 'Compartir' })).toBeInTheDocument()
  })

  it('says when the fixture is not out yet', () => {
    render(<PublicBoard name="Copa" subtitle="" categories={[]} shareText="" tvHref="/c/copa-1a2b/tv" />)
    expect(screen.getByText('El fixture todavía no está publicado.')).toBeInTheDocument()
  })
})

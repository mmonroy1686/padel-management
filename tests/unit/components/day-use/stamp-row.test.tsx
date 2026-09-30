import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { InsideList } from '@/components/day-use/inside-list'
import { StampRow } from '@/components/day-use/stamp-row'
import { NO_LOYALTY, type LoyaltyRule } from '@/lib/domain/loyalty'
import { at, TIMEZONE } from '../../fixtures/grid'

const RULE: LoyaltyRule = { enabled: true, every: 5, discountPercent: 100, expiryMonths: 6 }

describe('StampRow', () => {
  it('shows a ball per stamp, the earned ones first, and the reward at the end', () => {
    render(<StampRow loyalty={{ ...NO_LOYALTY, stamps: 3, progress: 3 }} rule={RULE} />)
    const items = within(screen.getByRole('list', { name: 'Tus sellos' })).getAllByRole('listitem')
    expect(items.map((item) => item.getAttribute('aria-label'))).toEqual([
      'Sello 1: ganado',
      'Sello 2: ganado',
      'Sello 3: ganado',
      'Sello 4: falta',
      'Sello 5: falta',
      'Recompensa -100%: por ganar',
    ])
    expect(screen.getByText('3 de 5 sellos')).toBeInTheDocument()
  })

  it('pops only the stamp just earned', () => {
    const { container } = render(<StampRow loyalty={{ ...NO_LOYALTY, stamps: 2, progress: 2 }} rule={RULE} />)
    expect(container.querySelectorAll('.stamp-pop')).toHaveLength(1)
  })

  it('lights the reward when there is one to use', () => {
    render(<StampRow loyalty={{ stamps: 5, earned: 1, used: 0, available: 1, progress: 0 }} rule={RULE} />)
    expect(screen.getByRole('listitem', { name: 'Recompensa -100%: disponible' })).toBeInTheDocument()
    expect(screen.getByText('0 de 5 sellos · Tenés 1 recompensa')).toBeInTheDocument()
  })
})

describe('InsideList', () => {
  it('lists who is in, with their pass and since when', () => {
    render(<InsideList people={[{ name: 'Gabi', productName: 'Day use completo', checkedInAt: at('10:12') }]} timezone={TIMEZONE} />)
    const item = within(screen.getByRole('region', { name: 'Ya están en el club' })).getByRole('listitem')
    expect(item).toHaveTextContent('Gabi')
    expect(item).toHaveTextContent('Day use completo, desde las 10:12')
  })

  it('says when nobody arrived yet', () => {
    render(<InsideList people={[]} timezone={TIMEZONE} />)
    expect(screen.getByText('Todavía no llegó nadie.')).toBeInTheDocument()
  })
})

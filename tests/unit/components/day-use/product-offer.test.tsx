import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ProductOffer, type ProductOfferProps } from '@/components/day-use/product-offer'
import type { FormAction } from '@/components/ui/action-form'
import { makeProduct } from '../../fixtures/day-use'

function renderOffer(overrides: Partial<ProductOfferProps> = {}) {
  const props: ProductOfferProps = {
    product: makeProduct(),
    date: '2026-10-03',
    dateText: 'sábado 3 de octubre',
    sold: 12,
    status: { ok: true, text: 'Comprar pase, $450' },
    reward: null,
    paymentNote: 'Se paga en el club.',
    action: vi.fn<FormAction>(),
    ...overrides,
  }
  render(<ProductOffer {...props} />)
}

const hidden = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value

describe('ProductOffer', () => {
  it('shows the pass, its hours, what it includes, the price and how full it is', () => {
    renderOffer()
    const card = screen.getByRole('article', { name: 'Day use completo' })
    expect(card).toHaveTextContent('08:00 a 12:30 · Vestuarios, Pileta y Cancha libre')
    expect(card).toHaveTextContent('$450')
    expect(screen.getByRole('progressbar', { name: 'Cupo' })).toHaveAttribute('aria-valuenow', '12')
    expect(card).toHaveTextContent('Quedan 18 de 30')
  })

  it('asks before buying', async () => {
    renderOffer()
    await userEvent.click(screen.getByRole('button', { name: 'Comprar pase, $450' }))
    const sheet = screen.getByRole('dialog', { name: 'Comprar pase' })
    expect(sheet).toHaveTextContent('Day use completo, sábado 3 de octubre, 08:00 a 12:30. $450. Se paga en el club.')
    expect(within(sheet).getByRole('button', { name: 'Confirmar compra' })).toBeInTheDocument()
    expect(hidden('date')).toBe('2026-10-03')
    expect(hidden('useReward')).toBe('false')
  })

  it('offers the reward when there is one', async () => {
    renderOffer({ reward: { percent: 100 } })
    await userEvent.click(screen.getByRole('button', { name: 'Usar mi recompensa (-100%)' }))
    expect(screen.getByRole('dialog', { name: 'Comprar pase' })).toHaveTextContent(
      'Con tu recompensa (-100%): $0. El day use con recompensa no suma sello.',
    )
    expect(hidden('useReward')).toBe('true')
  })

  it('says why the player cannot buy', () => {
    renderOffer({ status: { ok: false, text: 'No quedan lugares.' }, reward: { percent: 100 } })
    expect(screen.getByText('No quedan lugares.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Comprar pase|Usar mi recompensa/ })).not.toBeInTheDocument()
  })
})

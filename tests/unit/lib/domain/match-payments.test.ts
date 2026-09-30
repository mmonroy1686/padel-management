import { describe, expect, it } from 'vitest'
import { matchPlayerPayments, shareFor } from '@/lib/domain/match-payments'

describe('shareFor', () => {
  it('splits the price among four, the remainder on spot 1 (like private.match_share)', () => {
    expect([1, 2, 3, 4].map((position) => shareFor(1602, position))).toEqual([402, 400, 400, 400])
    expect(shareFor(1600, 1)).toBe(400)
  })
})

describe('matchPlayerPayments', () => {
  const slots = [
    { position: 2, player_id: 'b', player: { display_name: 'Bruno' } },
    { position: 1, player_id: 'a', player: { display_name: 'Ana' } },
    { position: 3, player_id: null, player: null },
  ]

  it('gives each player his share, what he owes and his payment state', () => {
    const payments = [
      { payer_id: 'a', status: 'confirmed' as const, amount: 402 },
      { payer_id: 'b', status: 'reported' as const, amount: 400 },
    ]
    expect(matchPlayerPayments({ price: 1602, status: 'confirmed' }, slots, payments)).toEqual([
      { playerId: 'a', name: 'Ana', position: 1, share: 402, due: 0, state: 'paid' },
      { playerId: 'b', name: 'Bruno', position: 2, share: 400, due: 400, state: 'reported' },
    ])
  })

  it('shows a refund when the match was cancelled after someone paid', () => {
    const [ana] = matchPlayerPayments({ price: 1600, status: 'cancelled' }, slots, [
      { payer_id: 'a', status: 'confirmed', amount: 400 },
    ])
    expect(ana).toMatchObject({ state: 'refund_due' })
  })
})

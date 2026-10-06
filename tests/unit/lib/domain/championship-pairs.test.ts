import { describe, expect, it } from 'vitest'
import { pairsCategories } from '@/lib/domain/championship-pairs'
import { BRUNO, LUCIA, makeCategory, makeChampionship, makeEntry, PEDRO } from '../../fixtures/championships'

describe('pairsCategories', () => {
  it('turns each category into the rows of its table, with phones, payment and hours', () => {
    const championship = makeChampionship({
      categories: [
        makeCategory({
          maxPairs: 1,
          entries: [
            makeEntry({
              id: 'e1',
              unavailable: ['2026-10-17@08:00'],
              unavailabilityApproved: true,
              note: 'Paga el sábado',
              payments: [{ status: 'confirmed', amount: 500, rejection_reason: null, created_at: '2026-10-08T12:00:00Z' }],
            }),
            makeEntry({ id: 'e2', player1: BRUNO, player2: LUCIA, status: 'waiting' }),
            makeEntry({ id: 'e3', status: 'withdrawn' }),
          ],
        }),
        makeCategory({ id: 'k2', name: '4ta', status: 'cancelled' }),
      ],
    })
    const phones = new Map([[PEDRO.id, '099111001'], [LUCIA.id, '099111002']])
    expect(pairsCategories(championship, phones)).toEqual([
      {
        id: 'k1',
        name: '6ta Libre',
        spots: '1 de 1 parejas · 1 en espera',
        rows: [
          {
            entryId: 'e1', pair: 'Ana y Pedro', phones: '099111001', levels: '5ª y 6ª', status: 'active', position: 0,
            stateText: 'Con lugar', paymentState: 'pending', due: 1500, hoursText: 'No pueden en 1 franja.', approved: true,
            unavailable: ['2026-10-17@08:00'], hoursNote: null, note: 'Paga el sábado',
          },
          {
            entryId: 'e2', pair: 'Bruno y Lucía', phones: '099111002', levels: '5ª y 6ª', status: 'waiting', position: 1,
            stateText: 'En espera, puesto 1', paymentState: 'none', due: 2000, hoursText: 'Pueden jugar en cualquier horario.',
            approved: false, unavailable: [], hoursNote: null, note: null,
          },
        ],
      },
    ])
  })
})

import { describe, expect, it } from 'vitest'
import {
  clubDayRange,
  filterBoard,
  paymentsBoard,
  pendingCount,
  splitDebts,
  type BoardItem,
  type BoardColumn,
  type BoardFormat,
  type BoardInput,
  type ColumnKey,
} from '@/lib/domain/payments-board'

const at = (iso: string) => new Date(iso)
const FORMAT: BoardFormat = {
  when: (instant) => `día ${instant.toISOString().slice(0, 10)}`,
  time: (instant) => instant.toISOString().slice(11, 16),
  deskMethods: ['cash'],
}

function input(overrides: Partial<BoardInput> = {}): BoardInput {
  return {
    transfers: [
      { id: 't2', kind: 'tournament', amount: 400, holder: 'Bruno Silva', startsAt: at('2026-11-20T21:00:00Z'), courtName: 'Torneo Americano', receiptUrl: null },
      { id: 't1', kind: 'booking', amount: 1600, holder: 'Ana López', startsAt: at('2026-11-19T23:00:00Z'), courtName: 'Cancha 1', receiptUrl: 'https://x/r1.png' },
    ],
    unpaid: [{ bookingId: 'b1', holder: 'Martina', startsAt: at('2026-11-21T23:00:00Z'), courtName: 'Cancha 2', due: 1200, payerId: 'u1' }],
    unpaidEntries: [{ entryId: 'e1', holder: 'Diego', startsAt: at('2026-11-18T21:00:00Z'), tournamentName: 'Relámpago', due: 500 }],
    unpaidPasses: [{ passId: 'p1', holder: 'Carla Ruiz', startsAt: at('2026-11-22T17:00:00Z'), productName: 'Day use pádel', due: 450 }],
    unpaidChampionships: [{ entryId: 'c1', holder: 'Eva y Flor', startsAt: at('2026-11-15T11:00:00Z'), what: 'Campeonato Primavera · 6ta', due: 2000 }],
    refunds: [{ paymentId: 'r1', kind: 'booking', holder: 'Gabi', startsAt: at('2026-11-24T23:00:00Z'), courtName: 'Cancha 3', amount: 800 }],
    doneToday: {
      confirmed: [
        { id: 'd1', kind: 'booking', amount: 300, holder: 'Hugo', startsAt: at('2026-11-23T13:00:00Z'), courtName: 'Cancha 1', method: 'cash', confirmedAt: at('2026-11-23T14:10:00Z') },
        { id: 'd2', kind: 'day_use', amount: 450, holder: 'Inés', startsAt: null, courtName: 'Day use pádel', method: 'transfer', confirmedAt: at('2026-11-23T15:30:00Z') },
      ],
      refunded: [
        { id: 'd3', kind: 'booking', amount: 800, holder: 'Juan', startsAt: at('2026-11-25T23:00:00Z'), courtName: 'Cancha 2', method: 'cash', confirmedAt: at('2026-11-23T12:00:00Z') },
      ],
      rejected: [
        { id: 'd4', kind: 'booking', amount: 1200, holder: 'Kevin', startsAt: at('2026-11-27T11:00:00Z'), courtName: 'Cancha 1', method: 'transfer', confirmedAt: at('2026-11-23T16:00:00Z'), reason: 'No llegó la plata' },
        { id: 'd5', kind: 'tournament', amount: 400, holder: 'Lola', startsAt: null, courtName: 'Torneo Americano', method: 'transfer', confirmedAt: at('2026-11-23T17:00:00Z'), reason: null },
      ],
    },
    ...overrides,
  }
}

const column = (columns: BoardColumn[], key: ColumnKey) => columns.find((item) => item.key === key) as BoardColumn

describe('clubDayRange', () => {
  it('runs from the club’s local midnight to the next', () => {
    // 23:30 of the 22nd in Montevideo (UTC-3).
    expect(clubDayRange(at('2026-11-23T02:30:00Z'), 'America/Montevideo')).toEqual({
      from: at('2026-11-22T03:00:00Z'),
      to: at('2026-11-23T03:00:00Z'),
    })
  })

  it('lasts 25 hours on the day the clocks go back', () => {
    expect(clubDayRange(at('2026-11-01T15:00:00Z'), 'America/New_York')).toEqual({
      from: at('2026-11-01T04:00:00Z'),
      to: at('2026-11-02T05:00:00Z'),
    })
  })
})

describe('paymentsBoard', () => {
  it('lays out the six columns in their lanes, the done ones marked', () => {
    const columns = paymentsBoard(input(), FORMAT)
    expect(columns.map((item) => [item.lane, item.title, item.done])).toEqual([
      ['collect', 'Sin cobrar', false],
      ['collect', 'Por confirmar', false],
      ['collect', 'Cobrado hoy', true],
      ['collect', 'Rechazado hoy', true],
      ['giveBack', 'A devolver', false],
      ['giveBack', 'Devuelto hoy', true],
    ])
  })

  it('puts every kind of debt in Sin cobrar, oldest first, with its cash action and the total', () => {
    const unpaid = column(paymentsBoard(input(), FORMAT), 'unpaid')
    expect(unpaid.items.map((item) => [item.holder, item.kind, item.what])).toEqual([
      ['Eva y Flor', 'championship', 'Campeonato Primavera · 6ta'],
      ['Diego', 'tournament', 'Torneo Relámpago'],
      ['Martina', 'booking', 'Cancha 2'],
      ['Carla Ruiz', 'day_use', 'Day use pádel'],
    ])
    expect(unpaid.items[2]).toMatchObject({
      id: 'b1-u1',
      when: 'día 2026-11-21',
      amount: 1200,
      action: { type: 'charge', fields: { bookingId: 'b1', amount: '1200', payerId: 'u1' }, methods: ['cash'] },
    })
    expect(unpaid.items[3].action).toEqual({ type: 'charge', fields: { passId: 'p1', amount: '450' }, methods: ['cash'] })
    expect([unpaid.count, unpaid.total]).toEqual([4, 4150])
  })

  it('offers no desk charge when the club takes neither cash nor POS', () => {
    const unpaid = column(paymentsBoard(input(), { ...FORMAT, deskMethods: [] }), 'unpaid')
    expect(unpaid.items.every((item) => item.action === undefined)).toBe(true)
  })

  it('offers each desk method the club takes', () => {
    const unpaid = column(paymentsBoard(input(), { ...FORMAT, deskMethods: ['cash', 'card'] }), 'unpaid')
    expect(unpaid.items[3].action).toMatchObject({ type: 'charge', methods: ['cash', 'card'] })
  })

  it('lists the transfers to confirm oldest first, each opening its review with the receipt', () => {
    const transfers = column(paymentsBoard(input(), FORMAT), 'transfers')
    expect(transfers.items.map((item) => item.id)).toEqual(['t1', 't2'])
    expect(transfers.items[0].action).toEqual({ type: 'review', receiptUrl: 'https://x/r1.png' })
    expect([transfers.count, transfers.total]).toEqual([2, 2000])
  })

  it('lists the payments to give back with the refund action', () => {
    const refunds = column(paymentsBoard(input(), FORMAT), 'refunds')
    expect(refunds.items).toEqual([
      expect.objectContaining({ id: 'r1', holder: 'Gabi', action: { type: 'refund', fields: { paymentId: 'r1' } } }),
    ])
  })

  it('shows what got done today, latest first, with the method and the time; a desk charge can be voided', () => {
    const columns = paymentsBoard(input(), FORMAT)
    const collected = column(columns, 'collected')
    expect(collected.items.map((item) => [item.holder, item.done, item.action, item.when])).toEqual([
      ['Inés', { method: 'transfer', time: '15:30' }, undefined, ''],
      ['Hugo', { method: 'cash', time: '14:10' }, { type: 'void', fields: { paymentId: 'd1' } }, 'día 2026-11-23'],
    ])
    expect([collected.count, collected.total, collected.cash, collected.card]).toEqual([2, 750, 300, 0])
    expect(column(columns, 'unpaid').cash).toBeUndefined()
    expect(column(columns, 'refunded').items.map((item) => item.holder)).toEqual(['Juan'])
  })

  it('keeps POS apart from cash: only cash is in the till', () => {
    const base = input()
    const pos = { ...base.doneToday.confirmed[0], id: 'd9', amount: 1200, holder: 'Pía', method: 'card' as const }
    const collected = column(
      paymentsBoard(input({ doneToday: { ...base.doneToday, confirmed: [...base.doneToday.confirmed, pos] } }), FORMAT),
      'collected',
    )
    expect([collected.total, collected.cash, collected.card]).toEqual([1950, 300, 1200])
    expect(collected.items.find((item) => item.id === 'd9')?.done?.method).toBe('card')
  })

  it('shows the transfers rejected today with their reason, and no cash part', () => {
    const rejected = column(paymentsBoard(input(), FORMAT), 'rejected')
    expect(rejected.items.map((item) => [item.holder, item.done])).toEqual([
      ['Lola', { method: 'transfer', time: '17:00', rejection: 'Sin motivo' }],
      ['Kevin', { method: 'transfer', time: '16:00', rejection: 'No llegó la plata' }],
    ])
    expect([rejected.total, rejected.cash]).toEqual([1600, undefined])
  })
})

describe('filterBoard', () => {
  const columns = paymentsBoard(input(), FORMAT)

  it('leaves the board as is without a search or a kind', () => {
    expect(filterBoard(columns, { query: '  ', kind: '' })).toBe(columns)
  })

  it('searches who or what in every column, accents aside, and recounts', () => {
    const shown = filterBoard(columns, { query: 'cancha 1', kind: '' })
    expect(shown.map((item) => item.items.map((card) => card.holder))).toEqual([[], ['Ana López'], ['Hugo'], ['Kevin'], [], []])
    expect(column(shown, 'collected').total).toBe(300)
    expect(column(filterBoard(columns, { query: 'ines', kind: '' }), 'collected').items.map((item) => item.holder)).toEqual(['Inés'])
  })

  it('keeps one kind', () => {
    const shown = filterBoard(columns, { query: '', kind: 'day_use' })
    expect(shown.map((item) => item.count)).toEqual([1, 0, 1, 0, 0, 0])
  })
})

describe('pendingCount', () => {
  it('counts what is still to do in a lane, not what got done', () => {
    const columns = paymentsBoard(input(), FORMAT)
    expect(pendingCount(columns, 'collect')).toBe(6)
    expect(pendingCount(columns, 'giveBack')).toBe(1)
  })
})

describe('splitDebts', () => {
  const debt = (id: string, holder: string, at: number, amount = 1200): BoardItem => ({
    id,
    kind: 'booking',
    holder,
    what: 'Cancha 1',
    when: '',
    at,
    amount,
  })
  const TODAY = 1_000_000

  it('keeps today row by row, and groups a player with several older debts', () => {
    const split = splitDebts(
      [
        debt('a', 'Sofía Cabrera', 100),
        debt('b', 'Nicolás Rodríguez', 200),
        debt('c', 'sofia cabrera', 300, 2000),
        debt('d', 'Ana', TODAY + 10),
      ],
      TODAY,
    )
    expect(split.today.map((item) => item.id)).toEqual(['d'])
    expect(split.older.map((item) => item.id)).toEqual(['b'])
    expect(split.groups).toEqual([{ holder: 'Sofía Cabrera', items: [expect.objectContaining({ id: 'a' }), expect.objectContaining({ id: 'c' })], total: 3200 }])
  })

  it('has nothing to split when nothing is owed', () => {
    expect(splitDebts([], TODAY)).toEqual({ today: [], older: [], groups: [] })
  })
})

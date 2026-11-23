import { describe, expect, it } from 'vitest'
import {
  boardOf,
  buildableSlots,
  recommendationText,
  recommendedSlots,
  slotKey,
  type AssistantBoard,
  type BoardSlot,
} from '@/lib/domain/assistant-board'
import { boardSlot, candidate, strongRows } from '../../fixtures/assistant'
import { at, COURTS, makeGrid, occupancy, RULES, TIMEZONE } from '../../fixtures/grid'
import { makeMatch } from '../../fixtures/matches'

describe('buildableSlots', () => {
  it('takes the free slots that still accept a match, without the taken and the forming ones', () => {
    const grid = makeGrid({ occupancies: [occupancy('o1', 'court-1', '11:00', '12:30')], matches: [makeMatch()] })
    const slots = buildableSlots(grid, at('07:00'), 180)
    // 11:00 onwards closes after 07:00: 8 times on 2 courts, minus the taken one and the forming one.
    expect(slots).toHaveLength(14)
    expect(slots[0]).toEqual({ courtId: 'court-2', startsAt: at('11:00') })
    expect(slots).not.toContainEqual({ courtId: 'court-1', startsAt: at('20:00') })
  })
})

describe('boardOf', () => {
  it('drops the past times and tells free, taken and forming apart', () => {
    const grid = makeGrid({
      occupancies: [occupancy('o1', 'court-2', '11:00', '12:30')],
      matches: [makeMatch()],
      now: at('09:00'),
    })
    const rows = [candidate('a')]
    const board = boardOf(grid, new Map([[slotKey('court-2', at('09:30')), rows]]))
    expect(board.courts).toEqual([
      { id: 'court-1', name: 'Cancha 1' },
      { id: 'court-2', name: 'Cancha 2' },
    ])
    expect(board.rows).toHaveLength(9)
    expect(board.rows[0].label).toBe('09:30')
    expect(board.rows[0].cells[0]).toEqual({ state: 'free', slot: null })
    expect(board.rows[0].cells[1]).toMatchObject({ state: 'free', slot: { courtName: 'Cancha 2', label: '09:30', rows } })
    expect(board.rows[1].cells[1]).toEqual({ state: 'taken' })
    expect(board.rows[7].cells[0]).toEqual({ state: 'forming', matchId: 'm1', filled: 1 })
  })

  it('shows a time without a price as no slot', () => {
    const board = boardOf(makeGrid({ rules: [RULES[0]] }), new Map())
    expect(board.rows.at(-1)?.cells).toEqual([{ state: 'none' }, { state: 'none' }])
  })
})

describe('recommendedSlots', () => {
  const board = (slots: BoardSlot[]): AssistantBoard => ({
    courts: COURTS.map(({ id, name }) => ({ id, name })),
    rows: [{ label: 'todos', cells: slots.map((slot) => ({ state: 'free' as const, slot })) }],
  })
  const a = boardSlot('court-1', '20:00', strongRows(8, 'a'))
  const b = boardSlot('court-2', '20:00', strongRows(7, 'b'))
  const c = boardSlot('court-1', '18:30', strongRows(4, 'c'))
  const d = boardSlot('court-2', '17:00', strongRows(5, 'd'))
  const e = boardSlot('court-1', '15:30', strongRows(2, 'e'))
  // High demand, but it closed at 06:30.
  const f = boardSlot('court-2', '09:30', strongRows(8, 'f'))
  const g = boardSlot('court-2', '14:00', strongRows(3, 'g'))

  it('takes up to three by demand, never two at the same time, never a closed or a quiet one', () => {
    expect(recommendedSlots(board([a, b, c, d, e, f, g]), at('07:00'), 180).map((slot) => slot.key)).toEqual([
      a.key,
      d.key,
      c.key,
    ])
  })

  it('says the day, the time, the court, the proposal and how many could play', () => {
    const [first] = recommendedSlots(board([a]), at('07:00'), 180)
    expect(recommendationText(first, TIMEZONE)).toBe('Jueves 20:00 · Cancha 1 · 5ª masculino · 8 posibles')
  })
})

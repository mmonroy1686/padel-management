import { describe, expect, it } from 'vitest'
import { applyTable, pageRange, type TableRow } from '@/lib/domain/table'

const row = (id: string, name: string, category: number, role: string): TableRow<string> => ({
  id,
  cells: id,
  search: name,
  sort: { name, category },
  filters: { role, category: String(category) },
})

const ROWS = [
  row('1', 'Ana Pérez', 5, 'player'),
  row('2', 'Bruno Silva', 3, 'player'),
  row('3', 'Carla Gómez', 5, 'reception'),
  row('4', 'Ángel Núñez', 7, 'player'),
]

describe('applyTable', () => {
  it('searches without minding accents or case', () => {
    expect(applyTable(ROWS, { query: 'angel', filters: {}, page: 1, pageSize: 20 }).rows.map((r) => r.id)).toEqual(['4'])
    expect(applyTable(ROWS, { query: 'GÓMEZ', filters: {}, page: 1, pageSize: 20 }).rows.map((r) => r.id)).toEqual(['3'])
  })

  it('filters by every chosen value, and an empty one means all', () => {
    const shown = applyTable(ROWS, { query: '', filters: { role: 'player', category: '5' }, page: 1, pageSize: 20 })
    expect(shown.rows.map((r) => r.id)).toEqual(['1'])
    expect(applyTable(ROWS, { query: '', filters: { role: '' }, page: 1, pageSize: 20 }).total).toBe(4)
  })

  it('sorts text the Spanish way and numbers as numbers, either direction', () => {
    const byName = applyTable(ROWS, { query: '', filters: {}, sort: { key: 'name', dir: 'asc' }, page: 1, pageSize: 20 })
    expect(byName.rows.map((r) => r.id)).toEqual(['1', '4', '2', '3'])
    const byCategory = applyTable(ROWS, { query: '', filters: {}, sort: { key: 'category', dir: 'desc' }, page: 1, pageSize: 20 })
    expect(byCategory.rows.map((r) => r.id)).toEqual(['4', '1', '3', '2'])
  })

  it('cuts a page and keeps the page inside the results', () => {
    const second = applyTable(ROWS, { query: '', filters: {}, page: 2, pageSize: 3 })
    expect(second).toMatchObject({ page: 2, pageCount: 2, total: 4, from: 4, to: 4 })
    expect(second.rows.map((r) => r.id)).toEqual(['4'])
    expect(applyTable(ROWS, { query: '', filters: {}, page: 9, pageSize: 3 }).page).toBe(2)
    expect(applyTable([], { query: '', filters: {}, page: 1, pageSize: 3 })).toMatchObject({ page: 1, pageCount: 1, from: 0, to: 0 })
  })
})

describe('pageRange', () => {
  it('says which rows are shown', () => {
    expect(pageRange({ from: 21, to: 40, total: 143 })).toBe('21–40 de 143')
    expect(pageRange({ from: 0, to: 0, total: 0 })).toBe('0 de 0')
  })
})

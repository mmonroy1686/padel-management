import { normalizeText } from './members'

// The club's lists as tables: a row carries what it shows (cells) and what it is searched, sorted
// and filtered by, so filtering, sorting and paging stay plain functions.
export type TableRow<C> = {
  id: string
  cells: C
  // Text the search box looks in (names, codes).
  search: string
  sort: Record<string, string | number>
  filters?: Record<string, string>
}
export type SortState = { key: string; dir: 'asc' | 'desc' }
export type TableState = {
  query: string
  // Column key → chosen value; an empty value means "Todos".
  filters: Record<string, string>
  sort?: SortState
  page: number
  pageSize: number
}
export type TablePage<C> = { rows: TableRow<C>[]; total: number; page: number; pageCount: number; from: number; to: number }

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true })

function compare(a: string | number | undefined, b: string | number | undefined): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return collator.compare(String(a ?? ''), String(b ?? ''))
}

export function applyTable<C>(rows: TableRow<C>[], state: TableState): TablePage<C> {
  const words = normalizeText(state.query).split(/\s+/).filter(Boolean)
  const chosen = Object.entries(state.filters).filter(([, value]) => value !== '')
  const found = rows.filter((row) => {
    const text = normalizeText(row.search)
    return words.every((word) => text.includes(word)) && chosen.every(([key, value]) => row.filters?.[key] === value)
  })
  const { sort } = state
  const sorted = sort
    ? [...found].sort((a, b) => compare(a.sort[sort.key], b.sort[sort.key]) * (sort.dir === 'asc' ? 1 : -1))
    : found
  const pageCount = Math.max(1, Math.ceil(sorted.length / state.pageSize))
  const page = Math.min(Math.max(1, state.page), pageCount)
  const start = (page - 1) * state.pageSize
  const shown = sorted.slice(start, start + state.pageSize)
  return {
    rows: shown,
    total: sorted.length,
    page,
    pageCount,
    from: shown.length > 0 ? start + 1 : 0,
    to: start + shown.length,
  }
}

// "21–40 de 143".
export function pageRange({ from, to, total }: { from: number; to: number; total: number }): string {
  return total === 0 ? '0 de 0' : `${from}–${to} de ${total}`
}

'use client'

import { useId, useState, type ReactNode } from 'react'
import { inputClasses } from '@/components/ui/field'
import { cn } from '@/lib/cn'
import { applyTable, pageRange, type SortState, type TableRow } from '@/lib/domain/table'

export type DataColumn = {
  key: string
  label: string
  sortable?: boolean
  align?: 'start' | 'end'
  // Actions columns: the header stays for screen readers, phones show no label next to the cell.
  hideLabel?: boolean
}
export type DataFilter = { key: string; label: string; options: { value: string; label: string }[] }
export type DataRow = TableRow<Record<string, ReactNode>>

const PAGE_SIZES = [20, 50, 100]

// The club's long lists as a table: search, filters, sorting by column and pages. On a phone each
// row stacks as a small card with the column names, so nothing scrolls sideways.
export function DataTable({
  caption,
  columns,
  rows,
  filters = [],
  searchLabel,
  searchPlaceholder,
  initialSort,
  pageSize: initialPageSize = 20,
  emptyText,
}: {
  caption: string
  columns: DataColumn[]
  rows: DataRow[]
  filters?: DataFilter[]
  searchLabel: string
  searchPlaceholder?: string
  initialSort?: SortState
  pageSize?: number
  emptyText: string
}) {
  const id = useId()
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState<Record<string, string>>({})
  const [sort, setSort] = useState<SortState | undefined>(initialSort)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialPageSize)
  const shown = applyTable(rows, { query, filters: chosen, sort, page, pageSize })
  const filtering = query.trim() !== '' || Object.values(chosen).some((value) => value !== '')

  const toggleSort = (key: string) => {
    setSort((current) => (current?.key === key && current.dir === 'asc' ? { key, dir: 'desc' } : { key, dir: 'asc' }))
    setPage(1)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <label htmlFor={`${id}-search`} className="text-sm font-semibold">
            {searchLabel}
          </label>
          <input
            id={`${id}-search`}
            type="search"
            value={query}
            placeholder={searchPlaceholder}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
            }}
            className={inputClasses}
          />
        </div>
        {filters.map((filter) => (
          <div key={filter.key} className="flex min-w-36 flex-col gap-1.5">
            <label htmlFor={`${id}-${filter.key}`} className="text-sm font-semibold">
              {filter.label}
            </label>
            <select
              id={`${id}-${filter.key}`}
              value={chosen[filter.key] ?? ''}
              onChange={(event) => {
                setChosen((current) => ({ ...current, [filter.key]: event.target.value }))
                setPage(1)
              }}
              className={inputClasses}
            >
              <option value="">Todos</option>
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ))}
        {filtering ? (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setChosen({})
              setPage(1)
            }}
            className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-accent-ink underline"
          >
            Limpiar filtros
          </button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-4 text-fg-muted">{emptyText}</p>
      ) : (
        <>
          <table className="w-full border-separate border-spacing-0 text-left max-md:block">
            <caption className="sr-only">{caption}</caption>
            <thead className="max-md:sr-only">
              <tr>
                {columns.map((column) => {
                  const sorted = sort?.key === column.key ? sort.dir : null
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      aria-sort={column.sortable ? (sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none') : undefined}
                      className={cn(
                        'border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-fg-muted',
                        column.align === 'end' && 'text-right',
                      )}
                    >
                      {column.hideLabel ? <span className="sr-only">{column.label}</span> : null}
                      {!column.hideLabel && column.sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(column.key)}
                          className={cn(
                            'inline-flex min-h-11 items-center gap-1 uppercase hover:text-fg focus-visible:outline-2 focus-visible:outline-accent',
                            sorted && 'text-fg',
                          )}
                        >
                          {column.label}
                          <span aria-hidden="true">{sorted === 'asc' ? '▲' : sorted === 'desc' ? '▼' : '↕'}</span>
                        </button>
                      ) : null}
                      {!column.hideLabel && !column.sortable ? column.label : null}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody className="max-md:flex max-md:flex-col max-md:gap-2">
              {shown.rows.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-surface max-md:flex max-md:flex-col max-md:gap-1 max-md:rounded-2xl max-md:border max-md:border-border max-md:bg-surface max-md:p-3"
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        'border-b border-border px-3 py-2 align-middle max-md:flex max-md:items-center max-md:justify-between max-md:gap-3 max-md:border-0 max-md:p-0',
                        column.align === 'end' && 'text-right tabular-nums',
                      )}
                    >
                      {column.hideLabel ? null : (
                        <span aria-hidden="true" className="text-xs font-semibold uppercase tracking-wide text-fg-muted md:hidden">
                          {column.label}
                        </span>
                      )}
                      <span className="min-w-0">{row.cells[column.key]}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {shown.total === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-4 text-fg-muted">Nadie coincide con la búsqueda o los filtros.</p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="tabular-nums text-fg-muted" aria-live="polite">
              {pageRange(shown)}
            </p>
            <div className="flex items-center gap-2">
              <label htmlFor={`${id}-size`} className="text-fg-muted">
                Por página
              </label>
              <select
                id={`${id}-size`}
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value))
                  setPage(1)
                }}
                className="min-h-11 rounded-xl border border-border bg-bg px-2"
              >
                {[...new Set([initialPageSize, ...PAGE_SIZES])].sort((a, b) => a - b).map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label="Página anterior"
                disabled={shown.page <= 1}
                onClick={() => setPage(shown.page - 1)}
                className="inline-flex size-11 items-center justify-center rounded-xl border border-border text-lg hover:border-accent disabled:opacity-40"
              >
                ‹
              </button>
              <span className="tabular-nums">
                {shown.page} / {shown.pageCount}
              </span>
              <button
                type="button"
                aria-label="Página siguiente"
                disabled={shown.page >= shown.pageCount}
                onClick={() => setPage(shown.page + 1)}
                className="inline-flex size-11 items-center justify-center rounded-xl border border-border text-lg hover:border-accent disabled:opacity-40"
              >
                ›
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

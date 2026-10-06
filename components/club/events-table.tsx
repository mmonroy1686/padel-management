'use client'

import Link from 'next/link'
import { DataTable, type DataColumn, type DataRow } from '@/components/ui/data-table'

export type EventRow = {
  id: string
  name: string
  when: string
  // When it starts, for sorting.
  at: number
  status: string
  statusLabel: string
  // Who is in: "17 parejas · 2 en espera", "6 de 8 jugadores".
  people: string
  href: string
}

// Club panel: championships or americanos as a table (search, status filter, sorting) with "Gestionar".
export function EventsTable({
  caption,
  rows,
  peopleLabel,
  emptyText,
}: {
  caption: string
  rows: EventRow[]
  peopleLabel: string
  emptyText: string
}) {
  const columns: DataColumn[] = [
    { key: 'name', label: 'Nombre', sortable: true },
    { key: 'when', label: 'Cuándo', sortable: true },
    { key: 'status', label: 'Estado', sortable: true },
    { key: 'people', label: peopleLabel },
    { key: 'actions', label: 'Acciones', hideLabel: true },
  ]
  const statuses = [...new Map(rows.map((row) => [row.status, row.statusLabel])).entries()]
  const tableRows: DataRow[] = rows.map((row) => ({
    id: row.id,
    search: row.name,
    sort: { name: row.name, when: row.at, status: row.statusLabel },
    filters: { status: row.status },
    cells: {
      name: <span className="font-semibold">{row.name}</span>,
      when: row.when,
      status: (
        <span className="whitespace-nowrap rounded-full border border-border px-2 py-0.5 text-xs font-semibold">{row.statusLabel}</span>
      ),
      people: <span className="tabular-nums">{row.people}</span>,
      actions: (
        <Link
          href={row.href}
          aria-label={`Gestionar ${row.name}`}
          className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-semibold hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
        >
          Gestionar
        </Link>
      ),
    },
  }))

  return (
    <DataTable
      caption={caption}
      columns={columns}
      rows={tableRows}
      searchLabel="Buscar por nombre"
      initialSort={{ key: 'when', dir: 'asc' }}
      filters={[{ key: 'status', label: 'Estado', options: statuses.map(([value, label]) => ({ value, label })) }]}
      emptyText={emptyText}
    />
  )
}

'use client'

import { useState } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { DataTable, type DataColumn, type DataRow } from '@/components/ui/data-table'
import { scheduleText, type DayUseProduct } from '@/lib/domain/day-use'
import { formatPrice } from '@/lib/domain/format'
import { describeDays } from '@/lib/domain/settings'
import { ProductForm } from './product-form'

const COLUMNS: DataColumn[] = [
  { key: 'name', label: 'Pase', sortable: true },
  { key: 'days', label: 'Días' },
  { key: 'hours', label: 'Horario', sortable: true },
  { key: 'price', label: 'Precio', sortable: true, align: 'end' },
  { key: 'capacity', label: 'Cupo', sortable: true, align: 'end' },
  { key: 'status', label: 'Estado', sortable: true },
  { key: 'actions', label: 'Acciones', hideLabel: true },
]

// Day use settings: the club's passes as a table; "Editar" opens the pass form in a sheet, and each row
// turns its pass on or off.
export function ProductsTable({
  products,
  courts,
  saveAction,
  activeAction,
}: {
  products: DayUseProduct[]
  courts: { id: string; name: string }[]
  saveAction: FormAction
  activeAction: FormAction
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const editing = products.find((product) => product.id === editingId) ?? null

  const rows: DataRow[] = products.map((product) => ({
    id: product.id,
    search: product.name,
    sort: {
      name: product.name,
      hours: product.fromTime,
      price: product.price,
      capacity: product.capacity,
      status: product.isActive ? 'Activo' : 'Inactivo',
    },
    cells: {
      name: <span className="font-semibold">{product.name}</span>,
      days: product.weekdays.length > 0 ? describeDays(product.weekdays) : 'Solo fechas del calendario',
      hours: <span className="tabular-nums">{scheduleText(product)}</span>,
      price: <span className="font-semibold tabular-nums">{formatPrice(product.price)}</span>,
      capacity: <span className="tabular-nums">{product.capacity}</span>,
      status: product.isActive ? 'Activo' : <span className="text-fg-muted">Inactivo</span>,
      actions: (
        <span className="flex justify-end gap-1">
          <button
            type="button"
            aria-label={`Editar ${product.name}`}
            onClick={() => setEditingId(product.id)}
            className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-semibold hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
          >
            Editar
          </button>
          <ActionForm action={activeAction} submitLabel={product.isActive ? 'Desactivar' : 'Activar'} pendingLabel="Guardando…" variant="ghost">
            <input type="hidden" name="productId" value={product.id} />
            <input type="hidden" name="active" value={String(!product.isActive)} />
          </ActionForm>
        </span>
      ),
    },
  }))

  return (
    <>
      <DataTable caption="Pases" columns={COLUMNS} rows={rows} emptyText="Todavía no hay pases." />
      <BottomSheet open={editing !== null} onClose={() => setEditingId(null)} title={editing?.name ?? ''}>
        {editing ? <ProductForm key={editing.id} product={editing} courts={courts} action={saveAction} idPrefix={`pase-${editing.id}`} /> : null}
      </BottomSheet>
    </>
  )
}

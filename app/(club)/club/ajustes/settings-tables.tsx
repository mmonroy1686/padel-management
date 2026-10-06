'use client'

import { useState } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { DataTable, type DataColumn, type DataRow } from '@/components/ui/data-table'
import { Field, inputClasses } from '@/components/ui/field'
import { formatPrice } from '@/lib/domain/format'
import { describeDays } from '@/lib/domain/settings'
import { formatMinutes, parseTime } from '@/lib/domain/time'
import { DeleteCourtButton } from './delete-court-button'

export type CourtRow = { id: string; name: string; is_covered: boolean; is_active: boolean }
export type PriceRow = { id: string; weekdays: number[]; from_time: string; to_time: string; price: number }

const COURT_COLUMNS: DataColumn[] = [
  { key: 'name', label: 'Cancha' },
  { key: 'covered', label: 'Techo' },
  { key: 'active', label: 'Estado' },
  { key: 'actions', label: 'Acciones', hideLabel: true },
]

const PRICE_COLUMNS: DataColumn[] = [
  { key: 'days', label: 'Días' },
  { key: 'from', label: 'Desde', sortable: true },
  { key: 'to', label: 'Hasta', sortable: true },
  { key: 'price', label: 'Precio', sortable: true, align: 'end' },
  { key: 'actions', label: 'Acciones', hideLabel: true },
]

const hhmm = (value: string) => formatMinutes(parseTime(value))

const editClasses =
  'inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-semibold hover:border-accent focus-visible:outline-2 focus-visible:outline-accent'

// Ajustes: the club's courts as a table; "Editar" opens the name, roof and active in a sheet.
export function CourtsTable({ courts, updateAction, deleteAction }: { courts: CourtRow[]; updateAction: FormAction; deleteAction: FormAction }) {
  const [editing, setEditing] = useState<CourtRow | null>(null)
  const rows: DataRow[] = courts.map((court) => ({
    id: court.id,
    search: court.name,
    sort: {},
    cells: {
      name: <span className="font-semibold">{court.name}</span>,
      covered: court.is_covered ? 'Techada' : 'Al aire libre',
      active: court.is_active ? 'Activa' : <span className="text-fg-muted">Inactiva</span>,
      actions: (
        <button type="button" aria-label={`Editar ${court.name}`} onClick={() => setEditing(court)} className={editClasses}>
          Editar
        </button>
      ),
    },
  }))

  return (
    <>
      <DataTable caption="Canchas" columns={COURT_COLUMNS} rows={rows} emptyText="Todavía no hay canchas." />
      <BottomSheet open={editing !== null} onClose={() => setEditing(null)} title={editing?.name ?? ''}>
        {editing ? (
          <div className="flex flex-col gap-5">
            <ActionForm key={editing.id} action={updateAction} submitLabel="Guardar cancha" variant="secondary" onDone={() => setEditing(null)}>
              <input type="hidden" name="courtId" value={editing.id} />
              <Field label="Nombre" htmlFor="court-name">
                <input id="court-name" name="name" required maxLength={40} defaultValue={editing.name} className={inputClasses} />
              </Field>
              <label className="flex min-h-11 items-center gap-3">
                <input type="checkbox" name="is_covered" defaultChecked={editing.is_covered} className="size-5 accent-accent" />
                Techada
              </label>
              <label className="flex min-h-11 items-center gap-3">
                <input type="checkbox" name="is_active" defaultChecked={editing.is_active} className="size-5 accent-accent" />
                Activa (se ofrece para reservar)
              </label>
            </ActionForm>
            <DeleteCourtButton courtId={editing.id} courtName={editing.name} action={deleteAction} />
          </div>
        ) : null}
      </BottomSheet>
    </>
  )
}

// Ajustes: the price bands as a table, each with "Borrar".
export function PricesTable({ rules, deleteAction }: { rules: PriceRow[]; deleteAction: FormAction }) {
  const rows: DataRow[] = rules.map((rule) => ({
    id: rule.id,
    search: '',
    sort: { from: rule.from_time, to: rule.to_time, price: rule.price },
    cells: {
      days: describeDays(rule.weekdays),
      from: <span className="tabular-nums">{hhmm(rule.from_time)}</span>,
      to: <span className="tabular-nums">{hhmm(rule.to_time)}</span>,
      price: <span className="font-semibold tabular-nums">{formatPrice(rule.price)}</span>,
      actions: (
        <ActionForm action={deleteAction} submitLabel="Borrar" variant="ghost">
          <input type="hidden" name="ruleId" value={rule.id} />
        </ActionForm>
      ),
    },
  }))

  return <DataTable caption="Precios por franja" columns={PRICE_COLUMNS} rows={rows} emptyText="Todavía no hay precios: sin precio, un turno no se ofrece." />
}

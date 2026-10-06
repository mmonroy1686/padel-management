'use client'

import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { DataTable, type DataColumn, type DataRow } from '@/components/ui/data-table'
import { formatPrice } from '@/lib/domain/format'
import type { MoneyKind } from '@/lib/domain/payments-overview'

export type MoneyItem = {
  id: string
  kind: MoneyKind
  holder: string
  // The court, the tournament or the day use pass.
  what: string
  when: string
  // When it is or was, for sorting.
  at: number
  amount: number
  // The button and the hidden fields its form sends; none when the club takes no cash.
  action?: { label: string; fields: Record<string, string> }
}

export const MONEY_KIND_LABELS: Record<MoneyKind, string> = { booking: 'Reserva', tournament: 'Torneo', day_use: 'Day use' }

// Cobros: one of the money lists (owed or to give back) as a table, every kind of item together.
export function MoneyTable({
  caption,
  items,
  amountLabel,
  actions,
  emptyText,
}: {
  caption: string
  items: MoneyItem[]
  amountLabel: string
  actions: Record<MoneyKind, FormAction>
  emptyText: string
}) {
  const columns: DataColumn[] = [
    { key: 'holder', label: 'Quién', sortable: true },
    { key: 'what', label: 'Qué', sortable: true },
    { key: 'when', label: 'Cuándo', sortable: true },
    { key: 'amount', label: amountLabel, sortable: true, align: 'end' },
    { key: 'action', label: 'Acción', hideLabel: true },
  ]
  const rows: DataRow[] = items.map((item) => ({
    id: item.id,
    search: `${item.holder} ${item.what}`,
    sort: { holder: item.holder, what: item.what, when: item.at, amount: item.amount },
    filters: { kind: item.kind },
    cells: {
      holder: <span className="font-semibold">{item.holder}</span>,
      what: (
        <span className="flex flex-col">
          <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{MONEY_KIND_LABELS[item.kind]}</span>
          <span>{item.what}</span>
        </span>
      ),
      when: item.when,
      amount: <span className="font-display text-xl font-bold tabular-nums">{formatPrice(item.amount)}</span>,
      action: item.action ? (
        <ActionForm action={actions[item.kind]} submitLabel={item.action.label} pendingLabel="Guardando…" variant="secondary">
          {Object.entries(item.action.fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
        </ActionForm>
      ) : null,
    },
  }))

  return (
    <DataTable
      caption={caption}
      columns={columns}
      rows={rows}
      searchLabel="Buscar por nombre"
      initialSort={{ key: 'when', dir: 'desc' }}
      filters={[
        {
          key: 'kind',
          label: 'Tipo',
          options: (Object.keys(MONEY_KIND_LABELS) as MoneyKind[]).map((kind) => ({ value: kind, label: MONEY_KIND_LABELS[kind] })),
        },
      ]}
      emptyText={emptyText}
    />
  )
}

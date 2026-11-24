'use client'

import { PaymentBadge } from '@/components/booking/payment-badge'
import { DeskCharge } from '@/components/club/desk-charge'
import type { FormAction } from '@/components/ui/action-form'
import { ActionsMenu } from '@/components/ui/actions-menu'
import { DataTable, type DataColumn, type DataRow } from '@/components/ui/data-table'
import type { PairRow, PairsCategory } from '@/lib/domain/championship-pairs'
import { formatPrice } from '@/lib/domain/format'
import { PAYMENT_LABELS, type DeskMethod } from '@/lib/domain/payments'

export type PairAction = 'hours' | 'move' | 'remove'

const COLUMNS: DataColumn[] = [
  { key: 'pair', label: 'Pareja', sortable: true },
  { key: 'state', label: 'Estado', sortable: true },
  { key: 'payment', label: 'Pago', sortable: true },
  { key: 'hours', label: 'Horarios' },
  { key: 'actions', label: 'Acciones', hideLabel: true },
]

// Design: "por categoría, una tabla de parejas con estado de pago, Cobrar, Quitar, Mover, filtros (estado,
// pago) y búsqueda por nombre". Cash while it has a place and owes, small next to the payment state; the rest
// until the draw, behind one "Acciones" menu per pair (Quitar last, in the danger color).
export function PairsTable({
  category,
  editable,
  deskMethods,
  cashAction,
  onAction,
}: {
  category: PairsCategory
  editable: boolean
  deskMethods: DeskMethod[]
  cashAction: FormAction
  onAction: (action: PairAction, row: PairRow) => void
}) {
  const rows: DataRow[] = category.rows.map((row) => ({
    id: row.entryId,
    search: `${row.pair} ${row.phones}`,
    sort: { pair: row.pair, state: row.position, payment: PAYMENT_LABELS[row.paymentState] },
    filters: { status: row.status, payment: row.paymentState },
    cells: {
      pair: (
        <span className="flex flex-col">
          <span className="font-semibold">{row.pair}</span>
          <span className="text-xs text-fg-muted">
            {row.levels}
            {row.phones ? ` · ${row.phones}` : ''}
          </span>
          {row.note ? <span className="text-xs">{row.note}</span> : null}
        </span>
      ),
      state: row.stateText,
      // The badge, and cash next to it while it has a place and owes.
      payment: (
        <span className="flex flex-wrap items-center gap-2">
          <PaymentBadge state={row.paymentState} />
          {row.status === 'active' && row.paymentState === 'pending' && row.due > 0 ? (
            <DeskCharge
              action={cashAction}
              methods={deskMethods}
              label={`Cobrar ${formatPrice(row.due)}`}
              fields={{ entryId: row.entryId, amount: row.due }}
              size="sm"
            />
          ) : null}
        </span>
      ),
      hours: (
        <span className="text-sm">
          {row.hoursText}
          {row.approved ? ' Aprobado por el club.' : ''}
        </span>
      ),
      actions: (
        <span className="flex justify-end">
          {editable ? (
            <ActionsMenu
              label={`Acciones de ${row.pair}`}
              items={[
                { label: 'Horarios', onSelect: () => onAction('hours', row) },
                { label: 'Mover de categoría', onSelect: () => onAction('move', row) },
                { label: 'Quitar', onSelect: () => onAction('remove', row), danger: true },
              ]}
            />
          ) : null}
        </span>
      ),
    },
  }))

  return (
    <DataTable
      caption={`Parejas de ${category.name}`}
      columns={COLUMNS}
      rows={rows}
      searchLabel="Buscar por nombre o teléfono"
      initialSort={{ key: 'state', dir: 'asc' }}
      filters={[
        {
          key: 'status',
          label: 'Estado',
          options: [
            { value: 'active', label: 'Con lugar' },
            { value: 'waiting', label: 'En espera' },
          ],
        },
        {
          key: 'payment',
          label: 'Pago',
          options: (['pending', 'reported', 'paid', 'none'] as const).map((state) => ({ value: state, label: PAYMENT_LABELS[state] })),
        },
      ]}
      emptyText="Todavía no hay parejas en esta categoría."
    />
  )
}

'use client'

import { useActionState, useState, type ReactNode } from 'react'
import type { FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { buttonClasses } from '@/components/ui/button'
import { inputClasses } from '@/components/ui/field'
import { IDLE, type ActionState } from '@/lib/actions/result'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/domain/format'
import {
  filterBoard,
  KIND_LABELS,
  LANES,
  pendingCount,
  type BoardColumn,
  type BoardItem,
  type ColumnKey,
  type LaneKey,
} from '@/lib/domain/payments-board'
import type { MoneyKind } from '@/lib/domain/payments-overview'
import { BoardRow } from './board-row'
import { TransferReviewCard, type TransferView } from './transfer-review-card'

export type BoardActions = {
  cash: Record<MoneyKind, FormAction>
  refund: FormAction
  confirm: FormAction
  reject: FormAction
}

// The tiles on top: what is owed, waiting, in and to give back, always in sight.
const SUMMARY: { key: ColumnKey; label: string; unit: [string, string]; tone: string }[] = [
  { key: 'unpaid', label: 'Sin cobrar', unit: ['deuda', 'deudas'], tone: 'text-accent-ink' },
  { key: 'transfers', label: 'Por confirmar', unit: ['transferencia', 'transferencias'], tone: 'text-accent-ink' },
  { key: 'collected', label: 'Cobrado hoy', unit: ['pago', 'pagos'], tone: 'text-court-ink' },
  { key: 'refunds', label: 'A devolver', unit: ['pago', 'pagos'], tone: 'text-danger' },
]

const plural = (count: number, [one, many]: [string, string]) => `${count} ${count === 1 ? one : many}`

// Cobros as a board: a summary on top, then one lane at a time (Cobrar or Devolver) with its columns side by side on
// wide screens. Each payment sits in the column of its state and moves right when someone acts on it.
export function PaymentsBoard({ columns, actions }: { columns: BoardColumn[]; actions: BoardActions }) {
  const [lane, setLane] = useState<LaneKey>('collect')
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<MoneyKind | ''>('')
  // A copy of the transfer, so the sheet keeps its outcome after the page refreshes without it.
  const [reviewing, setReviewing] = useState<TransferView | null>(null)
  const shown = filterBoard(columns, { query, kind })
  const filtering = query.trim() !== '' || kind !== ''

  // A tile opens its lane and brings its column into view (a click commits before the next frame).
  const goTo = (column: BoardColumn) => {
    setLane(column.lane)
    requestAnimationFrame(() => document.getElementById(`column-${column.key}`)?.scrollIntoView({ block: 'start' }))
  }

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Resumen de cobros" className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
        {SUMMARY.map((tile) => {
          const column = columns.find((item) => item.key === tile.key)
          if (!column) return null
          return (
            <button
              key={tile.key}
              type="button"
              onClick={() => goTo(column)}
              className="flex min-h-11 flex-col items-start gap-0.5 rounded-2xl border border-border bg-surface p-3 text-left transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{tile.label}</span>
              <span className={cn('font-display text-2xl font-bold tabular-nums sm:text-3xl', column.count > 0 ? tile.tone : 'text-fg-muted')}>
                {formatPrice(column.total)}
              </span>
              <span className="text-sm text-fg-muted tabular-nums">
                {column.cash !== undefined && column.count > 0
                  ? `${formatPrice(column.cash)} en efectivo`
                  : column.count > 0
                    ? plural(column.count, tile.unit)
                    : column.done
                      ? 'Nada todavía'
                      : 'Al día'}
              </span>
            </button>
          )
        })}
      </nav>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="search"
          aria-label="Buscar por nombre o cancha"
          placeholder="Buscar por nombre o cancha"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className={inputClasses}
        />
        <select
          aria-label="Tipo"
          value={kind}
          onChange={(event) => setKind(event.target.value as MoneyKind | '')}
          className={cn(inputClasses, 'sm:w-48')}
        >
          <option value="">Todos</option>
          {(Object.keys(KIND_LABELS) as MoneyKind[]).map((option) => (
            <option key={option} value={option}>
              {KIND_LABELS[option]}
            </option>
          ))}
        </select>
      </div>

      {/* One lane at a time, so Devolver is one tap away however long Sin cobrar is. */}
      <div role="group" aria-label="Carril" className="grid grid-cols-2 gap-2 sm:flex">
        {LANES.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={lane === item.key}
            aria-controls="cobros-lane"
            onClick={() => setLane(item.key)}
            className={cn(
              'min-h-11 rounded-full border px-5 font-semibold focus-visible:outline-2 focus-visible:outline-accent',
              lane === item.key ? 'border-accent bg-accent text-on-accent' : 'border-border hover:border-accent',
            )}
          >
            {item.title} <span className="tabular-nums">{pendingCount(shown, item.key)}</span>
          </button>
        ))}
      </div>

      <section
        id="cobros-lane"
        aria-label={LANES.find((item) => item.key === lane)?.title}
        className="grid items-start gap-4 lg:auto-cols-fr lg:grid-flow-col"
      >
        {shown
          .filter((column) => column.lane === lane)
          .map((column) => (
            <ColumnView key={column.key} column={column} filtering={filtering}>
              {(row) => <RowAction item={row} actions={actions} onReview={setReviewing} />}
            </ColumnView>
          ))}
      </section>

      <BottomSheet open={reviewing !== null} onClose={() => setReviewing(null)} title={reviewing ? `Transferencia de ${reviewing.holder}` : ''}>
        {reviewing ? (
          <TransferReviewCard key={reviewing.id} transfer={reviewing} confirmAction={actions.confirm} rejectAction={actions.reject} />
        ) : null}
      </BottomSheet>
    </div>
  )
}

function ColumnView({ column, filtering, children }: { column: BoardColumn; filtering: boolean; children: (item: BoardItem) => ReactNode }) {
  const titleId = `column-${column.key}`
  return (
    <section
      aria-labelledby={titleId}
      className={cn('flex min-w-0 scroll-mt-4 flex-col rounded-2xl border px-4 py-3', column.done ? 'border-transparent bg-surface/60' : 'border-border bg-surface')}
    >
      <header className="flex items-baseline justify-between gap-2 border-b border-border pb-2">
        <h2 id={titleId} className="font-display text-lg font-bold uppercase">
          {column.title}
        </h2>
        <span className="text-sm font-semibold text-fg-muted tabular-nums">
          {column.count} · {formatPrice(column.total)}
        </span>
      </header>
      {column.cash !== undefined && column.count > 0 ? (
        <p className="pt-2 text-sm text-fg-muted tabular-nums">En efectivo: {formatPrice(column.cash)}</p>
      ) : null}
      {column.items.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border">
          {column.items.map((item) => (
            <li key={item.id}>
              <BoardRow item={item}>{children(item)}</BoardRow>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-3 text-sm text-fg-muted">{filtering ? 'Nada coincide con la búsqueda.' : column.emptyText}</p>
      )}
    </section>
  )
}

const ROW_BUTTON = 'shrink-0 px-3 text-base'

function RowAction({ item, actions, onReview }: { item: BoardItem; actions: BoardActions; onReview: (transfer: TransferView) => void }) {
  const action = item.action
  if (!action) return null
  if (action.type === 'review') {
    return (
      <button
        type="button"
        aria-label={`Revisar la transferencia de ${item.holder}`}
        onClick={() =>
          onReview({ id: item.id, amount: item.amount, holder: item.holder, when: item.when, courtName: item.what, receiptUrl: action.receiptUrl })
        }
        className={buttonClasses({ className: ROW_BUTTON })}
      >
        Revisar
      </button>
    )
  }
  return action.type === 'cash' ? (
    <RowForm action={actions.cash[item.kind]} fields={action.fields} label="Cobrar" accessibleLabel="Cobrar en efectivo" />
  ) : (
    <RowForm action={actions.refund} fields={action.fields} label="Devuelto" accessibleLabel="Marcar devuelto" />
  )
}

// A short button that runs the action in place; an error shows right under it. On success the page refreshes and the
// row moves to its done column.
function RowForm({ action, fields, label, accessibleLabel }: { action: FormAction; fields: Record<string, string>; label: string; accessibleLabel: string }) {
  const [state, formAction, pending] = useActionState(async (previous: ActionState, formData: FormData): Promise<ActionState> => (await action(previous, formData)) ?? previous, IDLE)
  return (
    <form action={formAction} className="flex shrink-0 flex-col items-end gap-1">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button
        type="submit"
        aria-label={accessibleLabel}
        disabled={pending}
        aria-busy={pending || undefined}
        className={buttonClasses({ variant: 'secondary', className: ROW_BUTTON })}
      >
        {pending ? 'Guardando…' : label}
      </button>
      {state.status === 'error' ? (
        <p role="alert" className="max-w-48 text-right text-sm text-danger">
          {state.message}
        </p>
      ) : null}
    </form>
  )
}

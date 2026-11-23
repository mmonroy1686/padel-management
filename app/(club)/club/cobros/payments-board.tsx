'use client'

import { useState, type ReactNode } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { inputClasses } from '@/components/ui/field'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/domain/format'
import {
  filterBoard,
  KIND_LABELS,
  LANES,
  pendingCount,
  type BoardColumn,
  type BoardItem,
  type LaneKey,
} from '@/lib/domain/payments-board'
import type { MoneyKind } from '@/lib/domain/payments-overview'
import { BoardCard } from './board-card'
import { TransferReviewCard, type TransferView } from './transfer-review-card'

export type BoardActions = {
  cash: Record<MoneyKind, FormAction>
  refund: FormAction
  confirm: FormAction
  reject: FormAction
}

// Cobros as a board: each payment sits in the column of its state and moves right when someone acts on it. On a
// phone the two lanes are tabs; from md up both show, their columns side by side.
export function PaymentsBoard({ columns, actions }: { columns: BoardColumn[]; actions: BoardActions }) {
  const [lane, setLane] = useState<LaneKey>('collect')
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<MoneyKind | ''>('')
  // A copy of the transfer, so the sheet keeps its outcome after the page refreshes without it.
  const [reviewing, setReviewing] = useState<TransferView | null>(null)
  const shown = filterBoard(columns, { query, kind })
  const filtering = query.trim() !== '' || kind !== ''

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="search"
          aria-label="Buscar por nombre"
          placeholder="Buscar por nombre"
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

      <div role="tablist" aria-label="Carriles de cobros" className="grid grid-cols-2 gap-2 md:hidden">
        {LANES.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={lane === item.key}
            aria-controls={`lane-${item.key}`}
            onClick={() => setLane(item.key)}
            className={cn(
              'min-h-11 rounded-full border px-4 font-semibold focus-visible:outline-2 focus-visible:outline-accent',
              lane === item.key ? 'border-accent bg-accent text-on-accent' : 'border-border',
            )}
          >
            {item.title} <span className="tabular-nums">{pendingCount(shown, item.key)}</span>
          </button>
        ))}
      </div>

      {LANES.map((item) => (
        <section
          key={item.key}
          id={`lane-${item.key}`}
          aria-labelledby={`lane-title-${item.key}`}
          className={cn('flex-col gap-3 md:flex', lane === item.key ? 'flex' : 'hidden')}
        >
          <h2 id={`lane-title-${item.key}`} className="font-display text-2xl font-bold uppercase">
            {item.title}
          </h2>
          <div className="grid gap-3 md:auto-cols-fr md:grid-flow-col">
            {shown
              .filter((column) => column.lane === item.key)
              .map((column) => (
                <ColumnView key={column.key} column={column} filtering={filtering}>
                  {(card) => <ItemAction item={card} actions={actions} onReview={setReviewing} />}
                </ColumnView>
              ))}
          </div>
        </section>
      ))}

      <BottomSheet open={reviewing !== null} onClose={() => setReviewing(null)} title={reviewing ? `Transferencia de ${reviewing.holder}` : ''}>
        {reviewing ? (
          <TransferReviewCard key={reviewing.id} transfer={reviewing} confirmAction={actions.confirm} rejectAction={actions.reject} />
        ) : null}
      </BottomSheet>
    </div>
  )
}

function ColumnView({
  column,
  filtering,
  children,
}: {
  column: BoardColumn
  filtering: boolean
  children: (item: BoardItem) => ReactNode
}) {
  const titleId = `column-${column.key}`
  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-2">
      <header className="flex items-baseline justify-between gap-2">
        <h3 id={titleId} className="font-display text-lg font-bold uppercase">
          {column.title}
        </h3>
        <span className="text-sm font-semibold text-fg-muted tabular-nums">
          {column.count} · {formatPrice(column.total)}
        </span>
      </header>
      {column.items.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {column.items.map((item) => (
            <li key={item.id}>
              <BoardCard item={item}>{children(item)}</BoardCard>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-border p-3 text-sm text-fg-muted">
          {filtering ? 'Nada coincide con la búsqueda.' : column.emptyText}
        </p>
      )}
    </section>
  )
}

function ItemAction({ item, actions, onReview }: { item: BoardItem; actions: BoardActions; onReview: (transfer: TransferView) => void }) {
  const action = item.action
  if (!action) return null
  if (action.type === 'review') {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          aria-label={`Revisar la transferencia de ${item.holder}`}
          onClick={() =>
            onReview({ id: item.id, amount: item.amount, holder: item.holder, when: item.when, courtName: item.what, receiptUrl: action.receiptUrl })
          }
          className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-sm font-bold text-on-accent hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Revisar
        </button>
        {action.receiptUrl ? (
          <a
            href={action.receiptUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`Ver comprobante de ${item.holder}`}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-ink underline"
          >
            Ver comprobante
          </a>
        ) : (
          <span className="text-sm text-fg-muted">Sin comprobante</span>
        )}
      </div>
    )
  }
  return (
    <ActionForm
      action={action.type === 'cash' ? actions.cash[item.kind] : actions.refund}
      submitLabel={action.type === 'cash' ? 'Cobrar en efectivo' : 'Marcar devuelto'}
      pendingLabel="Guardando…"
      variant="secondary"
    >
      {Object.entries(action.fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </ActionForm>
  )
}

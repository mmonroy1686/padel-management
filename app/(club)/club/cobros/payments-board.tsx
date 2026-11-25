'use client'

import { useActionState, useState, type ReactNode } from 'react'
import { ChargeChoice } from '@/components/club/charge-choice'
import type { FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { buttonClasses } from '@/components/ui/button'
import { inputClasses } from '@/components/ui/field'
import { Notice } from '@/components/ui/notice'
import { SubmitButton } from '@/components/ui/submit-button'
import { IDLE, type ActionState } from '@/lib/actions/result'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/domain/format'
import type { DeskMethod } from '@/lib/domain/payments'
import {
  filterBoard,
  KIND_LABELS,
  LANES,
  pendingCount,
  splitDebts,
  type BoardColumn,
  type BoardItem,
  type ColumnKey,
  type DebtGroup,
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
  // "Confirmar las marcadas": several transfers at once.
  confirmMany?: FormAction
}

// The tiles on top: what is owed, waiting, in and to give back, always in sight.
const SUMMARY: { key: ColumnKey; label: string; unit: [string, string]; tone: string }[] = [
  { key: 'unpaid', label: 'Sin cobrar', unit: ['deuda', 'deudas'], tone: 'text-accent-ink' },
  { key: 'transfers', label: 'Por confirmar', unit: ['transferencia', 'transferencias'], tone: 'text-accent-ink' },
  { key: 'collected', label: 'Cobrado hoy', unit: ['pago', 'pagos'], tone: 'text-court-ink' },
  { key: 'refunds', label: 'A devolver', unit: ['pago', 'pagos'], tone: 'text-danger' },
]

// Done columns show the latest few; the rest is one tap away, so the page ends.
const DONE_SHOWN = 5

const plural = (count: number, [one, many]: [string, string]) => `${count} ${count === 1 ? one : many}`

// What moved through the till, and by POS when there was any.
const tillText = (column: BoardColumn) =>
  `${formatPrice(column.cash ?? 0)} en efectivo${column.card ? ` · ${formatPrice(column.card)} por POS` : ''}`

// Cobros, for reception with someone waiting at the desk: the search first ("Cobrar a…"), then what is owed today
// row by row and older debts one group per player, the transfers to confirm (one by one or the marked ones at
// once), and what got done today as a short list. One lane at a time (Cobrar or Devolver). Charging asks how the
// player paid, the same step as on Inicio.
// `todayFrom`: the club's midnight (ms), where Sin cobrar splits today from older debts.
export function PaymentsBoard({ columns, actions, todayFrom = 0 }: { columns: BoardColumn[]; actions: BoardActions; todayFrom?: number }) {
  const [lane, setLane] = useState<LaneKey>('collect')
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<MoneyKind | ''>('')
  const [notice, setNotice] = useState<string | null>(null)
  // A copy of the transfer, so the sheet keeps its outcome after the page refreshes without it.
  const [reviewing, setReviewing] = useState<TransferView | null>(null)
  const shown = filterBoard(columns, { query, kind })
  const filtering = query.trim() !== '' || kind !== ''

  // A tile opens its lane and brings its column into view (a click commits before the next frame).
  const goTo = (column: BoardColumn) => {
    setLane(column.lane)
    requestAnimationFrame(() => document.getElementById(`column-${column.key}`)?.scrollIntoView({ block: 'start' }))
  }
  const rowAction = (item: BoardItem) => <RowAction item={item} actions={actions} onReview={setReviewing} onDone={setNotice} />

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="search"
          aria-label="Buscar por nombre o cancha"
          placeholder="Cobrar a… (nombre o cancha)"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className={cn(inputClasses, 'min-h-12 text-lg')}
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

      {notice ? <Notice onDismiss={() => setNotice(null)}>{notice}</Notice> : null}

      <nav aria-label="Resumen de cobros" className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {SUMMARY.map((tile) => {
          const column = columns.find((item) => item.key === tile.key)
          if (!column) return null
          return (
            <button
              key={tile.key}
              type="button"
              onClick={() => goTo(column)}
              className="flex min-h-11 flex-col items-start rounded-xl px-3 py-2 text-left hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
            >
              <span className="text-sm text-fg-muted">{tile.label}</span>
              <span className={cn('text-lg font-semibold tabular-nums', column.count > 0 ? tile.tone : 'text-fg-muted')}>
                {formatPrice(column.total)}
              </span>
              <span className="text-xs text-fg-muted tabular-nums">
                {column.cash !== undefined && column.count > 0
                  ? tillText(column)
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

      {/* One lane at a time, so Devolver is one tap away however long Sin cobrar is. A segmented control, not a
          primary button: it changes the view, it does not charge anyone. */}
      <div role="group" aria-label="Carril" className="inline-flex self-start rounded-full border border-border bg-surface p-1">
        {LANES.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={lane === item.key}
            aria-controls="cobros-lane"
            onClick={() => setLane(item.key)}
            className={cn(
              'min-h-10 rounded-full px-5 font-semibold focus-visible:outline-2 focus-visible:outline-accent',
              lane === item.key ? 'bg-bg text-fg shadow-sm' : 'text-fg-muted',
            )}
          >
            {item.title} <span className="tabular-nums">{pendingCount(shown, item.key)}</span>
          </button>
        ))}
      </div>

      <section
        id="cobros-lane"
        aria-label={LANES.find((item) => item.key === lane)?.title}
        className="grid items-start gap-6 lg:auto-cols-fr lg:grid-flow-col"
      >
        {shown
          .filter((column) => column.lane === lane)
          .map((column) => (
            <ColumnView key={column.key} column={column} filtering={filtering}>
              {column.key === 'unpaid' && !filtering ? (
                <UnpaidList items={column.items} todayFrom={todayFrom} action={rowAction} />
              ) : column.key === 'transfers' && actions.confirmMany && column.items.length > 1 ? (
                <TransferList items={column.items} confirmMany={actions.confirmMany} onDone={setNotice} action={rowAction} />
              ) : (
                <Rows items={column.items} limit={column.done ? DONE_SHOWN : undefined} action={rowAction} />
              )}
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

function ColumnView({ column, filtering, children }: { column: BoardColumn; filtering: boolean; children: ReactNode }) {
  const titleId = `column-${column.key}`
  return (
    <section aria-labelledby={titleId} className="flex min-w-0 scroll-mt-4 flex-col">
      <header className="flex items-baseline justify-between gap-2 pb-2">
        <h2 id={titleId} className="text-lg font-semibold">
          {column.title}
        </h2>
        <span className="text-sm font-semibold text-fg-muted tabular-nums">
          {column.count} · {formatPrice(column.total)}
        </span>
      </header>
      {column.cash !== undefined && column.count > 0 ? (
        <p className="pb-2 text-sm text-fg-muted tabular-nums">
          En efectivo: {formatPrice(column.cash)}
          {column.card ? ` · Por POS: ${formatPrice(column.card)}` : ''}
        </p>
      ) : null}
      {column.items.length > 0 ? children : <p className="py-3 text-sm text-fg-muted">{filtering ? 'Nada coincide con la búsqueda.' : column.emptyText}</p>}
    </section>
  )
}

// Rows with a line between them; `limit` shows the latest few and "Ver los N" the rest.
function Rows({ items, limit, action }: { items: BoardItem[]; limit?: number; action: (item: BoardItem) => ReactNode }) {
  const [all, setAll] = useState(false)
  const visible = limit && !all ? items.slice(0, limit) : items
  return (
    <>
      <ul className="flex flex-col divide-y divide-border border-y border-border">
        {visible.map((item) => (
          <li key={item.id}>{action(item)}</li>
        ))}
      </ul>
      {visible.length < items.length ? (
        <button type="button" onClick={() => setAll(true)} className="min-h-11 self-start text-sm font-semibold text-accent-ink underline underline-offset-4">
          Ver los {items.length}
        </button>
      ) : null}
    </>
  )
}

// Sin cobrar: today first, then older debts, one group per player who owes more than once.
function UnpaidList({ items, todayFrom, action }: { items: BoardItem[]; todayFrom: number; action: (item: BoardItem) => ReactNode }) {
  const { today, older, groups } = splitDebts(items, todayFrom)
  return (
    <div className="flex flex-col gap-4">
      {today.length > 0 ? <Rows items={today} action={action} /> : <p className="text-sm text-fg-muted">Hoy nadie debe nada.</p>}
      {older.length > 0 || groups.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-fg-muted">De días anteriores</h3>
          {groups.length > 0 ? (
            <ul aria-label="Deudas por jugador" className="flex flex-col divide-y divide-border border-y border-border">
              {groups.map((group) => (
                <DebtGroupRow key={group.holder} group={group} action={action} />
              ))}
            </ul>
          ) : null}
          {older.length > 0 ? <Rows items={older} action={action} /> : null}
        </div>
      ) : null}
    </div>
  )
}

function DebtGroupRow({ group, action }: { group: DebtGroup; action: (item: BoardItem) => ReactNode }) {
  return (
    <li>
      <details className="group">
        <summary className="flex min-h-14 cursor-pointer items-center gap-3 py-2.5">
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{group.holder}</span>
            <span className="block text-sm text-fg-muted">{group.items.length} deudas</span>
          </span>
          <span className="font-display text-xl font-bold tabular-nums">{formatPrice(group.total)}</span>
          <span aria-hidden="true" className="text-fg-muted transition-transform group-open:rotate-90">›</span>
        </summary>
        <ul className="flex flex-col divide-y divide-border border-t border-border pl-3">
          {group.items.map((item) => (
            <li key={item.id}>{action(item)}</li>
          ))}
        </ul>
      </details>
    </li>
  )
}

// Por confirmar with a box per transfer and "Confirmar las marcadas" for the ones already checked in the bank.
function TransferList({
  items,
  confirmMany,
  onDone,
  action,
}: {
  items: BoardItem[]
  confirmMany: FormAction
  onDone: (message: string) => void
  action: (item: BoardItem) => ReactNode
}) {
  const [marked, setMarked] = useState<Set<string>>(new Set())
  const [state, formAction, pending] = useActionState(async (previous: ActionState, formData: FormData) => {
    const result = (await confirmMany(previous, formData)) ?? previous
    if (result.status === 'ok') {
      setMarked(new Set())
      onDone(result.message ?? '')
    }
    return result
  }, IDLE)
  const toggle = (id: string) =>
    setMarked((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-border border-y border-border">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3">
            <input
              type="checkbox"
              aria-label={`Marcar la transferencia de ${item.holder}`}
              checked={marked.has(item.id)}
              onChange={() => toggle(item.id)}
              className="size-5 shrink-0 accent-[var(--accent)]"
            />
            <div className="min-w-0 flex-1">{action(item)}</div>
          </li>
        ))}
      </ul>
      {marked.size > 0 ? (
        <form action={formAction} className="flex flex-col gap-2">
          {[...marked].map((id) => (
            <input key={id} type="hidden" name="paymentId" value={id} />
          ))}
          <SubmitButton label={`Confirmar las marcadas (${marked.size})`} pendingLabel="Confirmando…" pending={pending} />
          {state.status === 'error' ? (
            <p role="alert" className="text-sm text-danger">
              {state.message}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  )
}

const ROW_BUTTON = 'shrink-0 px-3 text-base'

function RowAction({
  item,
  actions,
  onReview,
  onDone,
}: {
  item: BoardItem
  actions: BoardActions
  onReview: (transfer: TransferView) => void
  onDone: (message: string) => void
}) {
  const action = item.action
  if (!action) return <BoardRow item={item} />
  if (action.type === 'review') {
    return (
      <BoardRow item={item}>
        <button
          type="button"
          aria-label={`Revisar la transferencia de ${item.holder}`}
          onClick={() =>
            onReview({ id: item.id, amount: item.amount, holder: item.holder, when: item.when, courtName: item.what, receiptUrl: action.receiptUrl })
          }
          className={buttonClasses({ variant: 'secondary', className: ROW_BUTTON })}
        >
          Revisar
        </button>
      </BoardRow>
    )
  }
  if (action.type === 'charge') {
    return <ChargeRow item={item} fields={action.fields} methods={action.methods} action={actions.cash[item.kind]} onDone={onDone} />
  }
  return (
    <BoardRow item={item}>
      <RowForm action={actions.refund} fields={action.fields} label="Devuelto" accessibleLabel="Marcar devuelto" />
    </BoardRow>
  )
}

// "Cobrar" opens how the player paid, under the row: the same step as on Inicio.
function ChargeRow({
  item,
  fields,
  methods,
  action,
  onDone,
}: {
  item: BoardItem
  fields: Record<string, string>
  methods: DeskMethod[]
  action: FormAction
  onDone: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const title = `Cobrar ${formatPrice(item.amount)} a ${item.holder}`
  return (
    <BoardRow
      item={item}
      below={
        open ? (
          <ChargeChoice
            title={title}
            fields={fields}
            action={action}
            methods={{ cash: methods.includes('cash'), transfer: false, card: methods.includes('card') }}
            onDone={(message) => {
              setOpen(false)
              // "Cobramos $1.200 en efectivo." → "Cobramos $1.200 en efectivo a Paula.": who, at the top of the board.
              onDone(`${message.replace(/\.$/, '')} a ${item.holder}.`)
            }}
            onError={setError}
            onCancel={() => setOpen(false)}
          />
        ) : error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null
      }
    >
      {open ? null : (
        <button
          type="button"
          aria-label={title}
          onClick={() => {
            setError(null)
            setOpen(true)
          }}
          className={buttonClasses({ variant: 'secondary', className: ROW_BUTTON })}
        >
          Cobrar
        </button>
      )}
    </BoardRow>
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

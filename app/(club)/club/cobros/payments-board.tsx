'use client'

import { useActionState, useEffect, useState, type ReactNode } from 'react'
import { ChargeChoice } from '@/components/club/charge-choice'
import { ChargeReceipt, UNDO_MS } from '@/components/club/charge-receipt'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { buttonClasses } from '@/components/ui/button'
import { inputClasses } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { IDLE, type ActionState } from '@/lib/actions/result'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/domain/format'
import { DESK_METHODS, type DeskMethod } from '@/lib/domain/payments'
import {
  filterBoard,
  KIND_LABELS,
  LANES,
  pendingCount,
  debtsByPlayer,
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
  // "Anular": a cash or POS charge of today, taken back.
  void?: FormAction
  // "Deshacer": every payment a charge just made, voided together or not at all.
  voidMany?: FormAction
}

// The line on top: what is owed, waiting, in and to give back, in money, always in sight; a tap opens its list.
const SUMMARY: { key: ColumnKey; label: string; tone: string }[] = [
  { key: 'unpaid', label: 'Sin cobrar', tone: 'text-accent-ink' },
  { key: 'transfers', label: 'Por confirmar', tone: 'text-accent-ink' },
  { key: 'collected', label: 'Cobrado hoy', tone: 'text-court-ink' },
  { key: 'refunds', label: 'A devolver', tone: 'text-danger' },
]

// Done columns show the latest few; the rest is one tap away, so the page ends.
const DONE_SHOWN = 5
// Sin cobrar shows the first players (today's first); the search finds anyone else, and "Ver los N" lists them all.
const DEBTS_SHOWN = 8


const plural = (count: number, [one, many]: [string, string]) => `${count} ${count === 1 ? one : many}`
const PEOPLE: [string, string] = ['persona', 'personas']

// Cobros, for reception with someone waiting at the desk: the search first ("Cobrar a…"), then what is owed, one
// entry per player (whoever owes from today first), the transfers to confirm folded into one line (then one by one
// or the marked ones at once), and what got done today as a short list. One lane at a time (Cobrar or Devolver). Charging asks how the
// player paid, the same step as on Inicio.
// `todayFrom`: the club's midnight (ms): players who owe from today go first in Sin cobrar.
// `initialQuery`: who to look for on arrival (Inicio's "+3 deudas más" and its search send the name).
export function PaymentsBoard({
  columns,
  actions,
  todayFrom = 0,
  initialQuery = '',
}: {
  columns: BoardColumn[]
  actions: BoardActions
  todayFrom?: number
  initialQuery?: string
}) {
  const [lane, setLane] = useState<LaneKey>('collect')
  const [query, setQuery] = useState(initialQuery)
  const [kind, setKind] = useState<MoneyKind | ''>('')
  const [notice, setNotice] = useState<string | null>(null)
  // A copy of the transfer, so the sheet keeps its outcome after the page refreshes without it.
  const [reviewing, setReviewing] = useState<TransferView | null>(null)
  const shown = filterBoard(columns, { query, kind })
  const filtering = query.trim() !== '' || kind !== ''
  // Por confirmar is back-office work: folded into one line until reception opens it (its tile, or Inicio's link to
  // #transferencias), so the debts of the people at the desk stay on top. A search shows the matches unfolded.
  const [transfersOpen, setTransfersOpen] = useState(false)
  useEffect(() => {
    if (window.location.hash !== '#transferencias') return
    // Read after hydration (the server has no hash): open on the next frame, then bring it into view.
    const frame = requestAnimationFrame(() => {
      setTransfersOpen(true)
      requestAnimationFrame(() => document.getElementById('column-transfers')?.scrollIntoView({ block: 'start' }))
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  // A tile opens its lane and brings its column into view (a click commits before the next frame).
  const goTo = (column: BoardColumn) => {
    setLane(column.lane)
    if (column.key === 'transfers') setTransfersOpen(true)
    requestAnimationFrame(() => document.getElementById(`column-${column.key}`)?.scrollIntoView({ block: 'start' }))
  }
  // The charge just made (one debt, or everything a person owed), for "Deshacer" for a few seconds: once the page
  // refreshes each one is a recent row of Cobrado hoy with the same holder and amount.
  const [lastCharge, setLastCharge] = useState<{ who: string; entries: { holder: string; amount: number }[]; at: number } | null>(null)
  useEffect(() => {
    if (!lastCharge) return
    const timer = window.setTimeout(() => setLastCharge(null), UNDO_MS)
    return () => window.clearTimeout(timer)
  }, [lastCharge])
  const undoable = lastCharge ? undoablePayments(columns, lastCharge.entries, lastCharge.at) : []
  const charged = (message: string, items: BoardItem[], who: string) => {
    setNotice(message)
    setLastCharge({ who, entries: items.map((item) => ({ holder: item.holder, amount: item.amount })), at: Date.now() })
  }
  const done = (message: string) => {
    setNotice(message)
    setLastCharge(null)
  }
  const rowAction = (item: BoardItem) => (
    <RowAction item={item} actions={actions} onReview={setReviewing} onDone={done} onCharged={(message) => charged(message, [item], item.holder)} />
  )
  const chargeAll = (group: DebtGroup, open: boolean, setOpen: (open: boolean) => void) => (
    <ChargeAll
      group={group}
      actions={actions}
      open={open}
      setOpen={setOpen}
      onCharged={(message) => charged(message, group.items, group.holder)}
      onError={setNotice}
    />
  )

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-2">
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
          className={cn(inputClasses, 'w-32 shrink-0 sm:w-48')}
        >
          <option value="">Todos</option>
          {(Object.keys(KIND_LABELS) as MoneyKind[]).map((option) => (
            <option key={option} value={option}>
              {KIND_LABELS[option]}
            </option>
          ))}
        </select>
      </div>


      <nav aria-label="Resumen de cobros" className="grid grid-cols-4 gap-1">
        {SUMMARY.map((tile) => {
          const column = columns.find((item) => item.key === tile.key)
          if (!column) return null
          return (
            <button
              key={tile.key}
              type="button"
              onClick={() => goTo(column)}
              className="flex min-h-11 flex-col items-start rounded-xl px-2 py-1.5 text-left hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
            >
              <span className="text-xs leading-tight text-fg-muted">{tile.label}</span>
              <span className={cn('font-semibold tabular-nums', column.count > 0 ? tile.tone : 'text-fg-muted')}>
                {formatPrice(column.total)}
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
              lane === item.key ? 'bg-fg text-bg' : 'text-fg-muted',
            )}
          >
            {/* Cobrar is the default; Devolver says how many wait, so a refund is not forgotten. */}
            {item.key === 'giveBack' && pendingCount(shown, item.key) > 0 ? `${item.title} ${pendingCount(shown, item.key)}` : item.title}
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
            <ColumnView
              key={column.key}
              column={column}
              filtering={filtering}
              // Sin cobrar counts people, the unit of its list (one entry per person).
              count={column.key === 'unpaid' && !filtering ? plural(debtsByPlayer(column.items, todayFrom).length, PEOPLE) : String(column.count)}
            >
              {column.key === 'unpaid' && !filtering ? (
                <UnpaidList items={column.items} todayFrom={todayFrom} action={rowAction} chargeAll={chargeAll} />
              ) : column.key === 'transfers' && !transfersOpen && !filtering ? (
                <button
                  type="button"
                  aria-expanded={false}
                  onClick={() => setTransfersOpen(true)}
                  className={buttonClasses({ variant: 'secondary', fullWidth: true })}
                >
                  {column.items.length === 1 ? 'Ver la transferencia' : `Ver las ${column.items.length} transferencias`}
                </button>
              ) : column.key === 'transfers' && actions.confirmMany && column.items.length > 1 ? (
                <TransferList items={column.items} confirmMany={actions.confirmMany} onDone={setNotice} action={rowAction} />
              ) : (
                <Rows items={column.items} limit={column.done ? DONE_SHOWN : undefined} action={rowAction} />
              )}
            </ColumnView>
          ))}
      </section>

      {/* Fixed at the bottom of the screen, where reception is looking after charging a row far down the list. Last in the board: its room goes at the end. */}
      {notice ? (
        <ChargeReceipt
          key={`${notice}-${lastCharge?.at ?? 0}`}
          message={notice}
          undo={
            lastCharge && undoable.length === lastCharge.entries.length && actions.voidMany
              ? { paymentIds: undoable, action: actions.voidMany, label: `Deshacer el cobro a ${lastCharge.who}` }
              : null
          }
          onDismiss={() => setNotice(null)}
          onUndone={done}
        />
      ) : null}

      <BottomSheet open={reviewing !== null} onClose={() => setReviewing(null)} title={reviewing ? `Transferencia de ${reviewing.holder}` : ''}>
        {reviewing ? (
          <TransferReviewCard key={reviewing.id} transfer={reviewing} confirmAction={actions.confirm} rejectAction={actions.reject} />
        ) : null}
      </BottomSheet>
    </div>
  )
}

function ColumnView({ column, filtering, count, children }: { column: BoardColumn; filtering: boolean; count: string; children: ReactNode }) {
  const titleId = `column-${column.key}`
  return (
    <section aria-labelledby={titleId} className="flex min-w-0 scroll-mt-4 flex-col">
      <header className="flex items-baseline justify-between gap-2 pb-2">
        <h2 id={titleId} className="text-lg font-semibold">
          {column.title}
        </h2>
        <span className="text-sm font-semibold text-fg-muted tabular-nums">
          {count} · {formatPrice(column.total)}
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

// Sin cobrar: one entry per player (today and older days together), whoever owes from today first.
function UnpaidList({
  items,
  todayFrom,
  action,
  chargeAll,
}: {
  items: BoardItem[]
  todayFrom: number
  action: (item: BoardItem) => ReactNode
  chargeAll: ChargeAllSlot
}) {
  const groups = debtsByPlayer(items, todayFrom)
  const [all, setAll] = useState(false)
  const visible = all ? groups : groups.slice(0, DEBTS_SHOWN)
  return (
    <>
      <ul aria-label="Deudas por jugador" className="flex flex-col divide-y divide-border border-y border-border">
        {visible.map((group) =>
          group.items.length === 1 ? (
            <li key={group.items[0].id}>{action(group.items[0])}</li>
          ) : (
            <DebtGroupRow key={group.holder} group={group} action={action} chargeAll={chargeAll} />
          ),
        )}
      </ul>
      {visible.length < groups.length ? (
        <button type="button" onClick={() => setAll(true)} className="min-h-11 self-start text-sm font-semibold text-accent-ink underline underline-offset-4">
          Ver las {groups.length} personas
        </button>
      ) : null}
    </>
  )
}

// What draws "Cobrar todo" for a group: the button in its row while closed, the payment choice under it once open.
type ChargeAllSlot = (group: DebtGroup, open: boolean, setOpen: (open: boolean) => void) => ReactNode

function DebtGroupRow({ group, action, chargeAll }: { group: DebtGroup; action: (item: BoardItem) => ReactNode; chargeAll: ChargeAllSlot }) {
  const [charging, setCharging] = useState(false)
  return (
    <li className="flex flex-col gap-2">
      <details className="group">
        <summary className="flex min-h-14 cursor-pointer items-center gap-3 py-2.5">
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{group.holder}</span>
            <span className="block text-sm text-fg-muted">
              {group.items.length} deudas{group.today ? " · incluye hoy" : ""}
            </span>
          </span>
          <span className="font-display text-xl font-bold tabular-nums">{formatPrice(group.total)}</span>
          {charging ? null : chargeAll(group, false, setCharging)}
          <span aria-hidden="true" className="text-fg-muted transition-transform group-open:rotate-90">›</span>
        </summary>
        <ul className="flex flex-col divide-y divide-border border-t border-border pl-3">
          {group.items.map((item) => (
            <li key={item.id}>{action(item)}</li>
          ))}
        </ul>
      </details>
      {charging ? <div className="pb-2">{chargeAll(group, true, setCharging)}</div> : null}
    </li>
  )
}

// The rows of Cobrado hoy that a charge just made (same holder and amount, within the last minute), each matched once:
// what "Deshacer" takes back. Fewer than charged: not refreshed yet, so no Deshacer.
function undoablePayments(columns: BoardColumn[], entries: { holder: string; amount: number }[], at: number): string[] {
  const collected = columns.find((column) => column.key === 'collected')?.items ?? []
  const taken = new Set<string>()
  for (const entry of entries) {
    const match = collected.find(
      (item) =>
        !taken.has(item.id) &&
        item.action?.type === 'void' &&
        item.holder === entry.holder &&
        item.amount === entry.amount &&
        item.at >= at - 60_000,
    )
    if (match?.action?.type === 'void') taken.add(match.action.fields.paymentId ?? match.id)
  }
  return [...taken]
}

// "Cobrar $4.800" on a person who owes several things: one way to pay and one confirm for all of it, instead of
// opening the group and charging each debt while the queue waits. Each debt goes through its own Server Action (the
// rules stay those of a single charge), one after the other; if one fails, the ones before it stay charged and the
// message says what is left. Only the desk methods every debt accepts.
function ChargeAll({
  group,
  actions,
  open,
  setOpen,
  onCharged,
  onError,
}: {
  group: DebtGroup
  actions: BoardActions
  open: boolean
  setOpen: (open: boolean) => void
  onCharged: (message: string) => void
  onError: (message: string) => void
}) {
  const [pending, setPending] = useState(false)
  const charges = group.items.flatMap((item) => (item.action?.type === 'charge' ? [{ item, action: item.action }] : []))
  if (charges.length !== group.items.length) return null
  const methods = DESK_METHODS.filter((method) => charges.every((charge) => charge.action.methods.includes(method)))
  if (methods.length === 0) return null
  const title = `Cobrar ${formatPrice(group.total)} a ${group.holder}`

  const pay = async (method: DeskMethod) => {
    setPending(true)
    let paid = 0
    for (const { item, action } of charges) {
      const data = new FormData()
      for (const [name, value] of Object.entries(action.fields)) data.set(name, value)
      data.set('method', method)
      const result = await actions.cash[item.kind](IDLE, data)
      if (result?.status === 'error') {
        setPending(false)
        setOpen(false)
        onError(
          paid > 0
            ? `Cobramos ${formatPrice(paid)} a ${group.holder}; faltó ${formatPrice(group.total - paid)}: ${result.message ?? 'no se pudo cobrar'}.`
            : (result.message ?? 'No pudimos cobrar.'),
        )
        return
      }
      paid += item.amount
    }
    setPending(false)
    setOpen(false)
    onCharged(`Cobramos ${formatPrice(group.total)} ${method === 'cash' ? 'en efectivo' : 'por POS'} a ${group.holder}.`)
  }

  if (!open) {
    return (
      // In the row's summary: it opens the payment choice without folding the group open or shut.
      <button
        type="button"
        aria-label={title}
        onClick={(event) => {
          event.preventDefault()
          setOpen(true)
        }}
        className={buttonClasses({ variant: 'outline', className: ROW_BUTTON })}
      >
        Cobrar
      </button>
    )
  }
  return (
    <div role="group" aria-label={title} className="flex flex-col gap-2 rounded-xl border border-accent bg-surface p-3">
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-sm text-fg-muted">{group.items.length} deudas: {group.items.map((item) => `${item.what} ${formatPrice(item.amount)}`).join(' · ')}</p>
      <div className="flex flex-wrap gap-2">
        {methods.map((method) => (
          <button key={method} type="button" disabled={pending} aria-busy={pending || undefined} onClick={() => pay(method)} className={buttonClasses({ size: 'sm' })}>
            {pending ? 'Cobrando…' : method === 'cash' ? 'Efectivo' : 'POS'}
          </button>
        ))}
        <button type="button" disabled={pending} onClick={() => setOpen(false)} className={buttonClasses({ variant: 'ghost', size: 'sm' })}>
          Volver
        </button>
      </div>
    </div>
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

  const all = marked.size === items.length
  const toggleAll = () => setMarked(all ? new Set() : new Set(items.map((item) => item.id)))

  return (
    <div className="flex flex-col gap-3">
      {/* Checked in the bank all at once: one tap marks them all, then unmark the odd one out. */}
      <label className="flex min-h-11 cursor-pointer items-center gap-3 font-semibold">
        <input
          type="checkbox"
          checked={all}
          ref={(box) => {
            if (box) box.indeterminate = marked.size > 0 && !all
          }}
          onChange={toggleAll}
          className="size-5 shrink-0 accent-[var(--accent)]"
        />
        {all ? 'Desmarcar todas' : `Marcar todas (${items.length})`}
      </label>
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
        // Stays in reach over a long queue: above the phone's bottom bar, at the bottom of the screen elsewhere.
        <form action={formAction} className="sticky bottom-24 z-10 flex flex-col gap-2 rounded-2xl bg-bg/95 py-2 md:bottom-4">
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
  onCharged,
}: {
  item: BoardItem
  actions: BoardActions
  onReview: (transfer: TransferView) => void
  onDone: (message: string) => void
  onCharged: (message: string, item: BoardItem) => void
}) {
  const action = item.action
  if (!action) return <BoardRow item={item} />
  if (action.type === 'void') {
    return (
      <BoardRow item={item}>
        {actions.void ? (
          <ActionForm
            action={actions.void}
            submitLabel="Anular"
            pendingLabel="Anulando…"
            confirmLabel="¿Anular? Tocá de nuevo"
            accessibleLabel={`Anular el cobro a ${item.holder}`}
            // Quiet: a day of normal charges should not look dangerous; the second tap still guards it.
            variant="ghost"
            size="sm"
            onDone={onDone}
            className="shrink-0"
          >
            {Object.entries(action.fields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
          </ActionForm>
        ) : null}
      </BoardRow>
    )
  }
  if (action.type === 'review') {
    return (
      <BoardRow item={item}>
        <button
          type="button"
          aria-label={`Revisar la transferencia de ${item.holder}`}
          onClick={() =>
            onReview({ id: item.id, amount: item.amount, holder: item.holder, when: item.when, courtName: item.what, receiptUrl: action.receiptUrl })
          }
          className={buttonClasses({ variant: 'outline', className: ROW_BUTTON })}
        >
          Revisar
        </button>
      </BoardRow>
    )
  }
  if (action.type === 'charge') {
    return <ChargeRow item={item} fields={action.fields} methods={action.methods} action={actions.cash[item.kind]} onDone={(message) => onCharged(message, item)} />
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
          className={buttonClasses({ variant: 'outline', className: ROW_BUTTON })}
        >
          Cobrar
        </button>
      )}
    </BoardRow>
  )
}

// A short button that runs the action in place; an error shows right under it. On success the page refreshes and the
// row moves to its done column.
function RowForm({
  action,
  fields,
  label,
  accessibleLabel,
  onDone,
}: {
  action: FormAction
  fields: Record<string, string>
  label: string
  accessibleLabel: string
  onDone?: (message: string) => void
}) {
  const [state, formAction, pending] = useActionState(async (previous: ActionState, formData: FormData): Promise<ActionState> => {
    const result = (await action(previous, formData)) ?? previous
    if (result.status === 'ok') onDone?.(result.message ?? '')
    return result
  }, IDLE)
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
        className={buttonClasses({ variant: 'outline', className: ROW_BUTTON })}
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

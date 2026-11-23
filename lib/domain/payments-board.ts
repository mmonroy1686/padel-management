import type { UnpaidChampionshipItem } from './championship-payments'
import type { UnpaidPassItem } from './day-use-payments'
import { normalizeText } from './members'
import { totalsOf, type MoneyKind, type RefundItem, type UnpaidItem } from './payments-overview'
import { addDays, localDateOf, zonedTime } from './time'
import type { UnpaidEntryItem } from './tournament-payments'

// Cobros as a board: what is owed, what is waiting and what got done today, in five columns and two lanes.

export type PaymentMethod = 'cash' | 'transfer'

// A transfer a player reported, waiting for reception to check it.
export type ReportedTransfer = {
  id: string
  kind: MoneyKind
  amount: number
  holder: string
  startsAt: Date | null
  courtName: string
  receiptUrl: string | null
}

// A payment confirmed or refunded within the club's today.
export type DonePayment = {
  id: string
  kind: MoneyKind
  amount: number
  holder: string
  startsAt: Date | null
  courtName: string
  method: PaymentMethod
  confirmedAt: Date
}

export type BoardInput = {
  transfers: ReportedTransfer[]
  unpaid: UnpaidItem[]
  unpaidEntries: UnpaidEntryItem[]
  unpaidPasses: UnpaidPassItem[]
  unpaidChampionships: UnpaidChampionshipItem[]
  refunds: (RefundItem & { kind: MoneyKind })[]
  doneToday: { confirmed: DonePayment[]; refunded: DonePayment[] }
}

// What the card's button does: take cash, give money back, or open the transfer's review.
export type ItemAction =
  | { type: 'cash'; fields: Record<string, string> }
  | { type: 'refund'; fields: Record<string, string> }
  | { type: 'review'; receiptUrl: string | null }

export type BoardItem = {
  id: string
  kind: MoneyKind
  holder: string
  // The court, the tournament, the day use product or the championship category.
  what: string
  when: string
  // Sorting: when it is or was played (pending), when it got done (done).
  at: number
  amount: number
  action?: ItemAction
  // Done columns only: how the money moved and at what time.
  done?: { method: PaymentMethod; time: string }
}

export type ColumnKey = 'unpaid' | 'transfers' | 'collected' | 'refunds' | 'refunded'
export type LaneKey = 'collect' | 'giveBack'

type ColumnHead = { key: ColumnKey; lane: LaneKey; title: string; emptyText: string; done: boolean }
// `cash`: done columns only, the part of the total that moved in cash (what the till should hold).
export type BoardColumn = ColumnHead & { items: BoardItem[]; count: number; total: number; cash?: number }

export const KIND_LABELS: Record<MoneyKind, string> = {
  booking: 'Reserva',
  tournament: 'Torneo',
  day_use: 'Day use',
  championship: 'Campeonato',
}

export const METHOD_LABELS: Record<PaymentMethod, string> = { cash: 'Efectivo', transfer: 'Transferencia' }

export const LANES: { key: LaneKey; title: string }[] = [
  { key: 'collect', title: 'Cobrar' },
  { key: 'giveBack', title: 'Devolver' },
]

const COLUMNS: ColumnHead[] = [
  { key: 'unpaid', lane: 'collect', title: 'Sin cobrar', emptyText: 'Nada pendiente en los últimos 30 días.', done: false },
  { key: 'transfers', lane: 'collect', title: 'Por confirmar', emptyText: 'No hay transferencias para confirmar.', done: false },
  { key: 'collected', lane: 'collect', title: 'Cobrado hoy', emptyText: 'Todavía no se cobró nada hoy.', done: true },
  { key: 'refunds', lane: 'giveBack', title: 'A devolver', emptyText: 'No hay devoluciones pendientes.', done: false },
  { key: 'refunded', lane: 'giveBack', title: 'Devuelto hoy', emptyText: 'Nada devuelto hoy.', done: true },
]

// The club's today, from its local midnight to the next.
export function clubDayRange(now: Date, timeZone: string): { from: Date; to: Date } {
  const today = localDateOf(now, timeZone)
  return { from: zonedTime(today, 0, timeZone), to: zonedTime(addDays(today, 1), 0, timeZone) }
}

// The page owns how dates read and whether the club takes cash.
export type BoardFormat = { when: (instant: Date) => string; time: (instant: Date) => string; acceptsCash: boolean }

const oldestFirst = (a: BoardItem, b: BoardItem) => a.at - b.at
const latestFirst = (a: BoardItem, b: BoardItem) => b.at - a.at

function withItems(head: ColumnHead, items: BoardItem[]): BoardColumn {
  const column: BoardColumn = { ...head, items, ...totalsOf(items, (item) => item.amount) }
  if (head.done) column.cash = totalsOf(items, (item) => (item.done?.method === 'cash' ? item.amount : 0)).total
  return column
}

export function paymentsBoard(input: BoardInput, format: BoardFormat): BoardColumn[] {
  const cash = (fields: Record<string, string>): Pick<BoardItem, 'action'> =>
    format.acceptsCash ? { action: { type: 'cash', fields } } : {}
  const played = (startsAt: Date) => ({ when: format.when(startsAt), at: startsAt.getTime() })
  const done = (payment: DonePayment): BoardItem => ({
    id: payment.id,
    kind: payment.kind,
    holder: payment.holder,
    what: payment.courtName,
    when: payment.startsAt ? format.when(payment.startsAt) : '',
    at: payment.confirmedAt.getTime(),
    amount: payment.amount,
    done: { method: payment.method, time: format.time(payment.confirmedAt) },
  })

  const items: Record<ColumnKey, BoardItem[]> = {
    unpaid: [
      ...input.unpaid.map((item): BoardItem => ({
        id: `${item.bookingId}-${item.payerId ?? ''}`,
        kind: 'booking',
        holder: item.holder,
        what: item.courtName,
        amount: item.due,
        ...played(item.startsAt),
        ...cash({ bookingId: item.bookingId, amount: String(item.due), ...(item.payerId ? { payerId: item.payerId } : {}) }),
      })),
      ...input.unpaidEntries.map((item): BoardItem => ({
        id: item.entryId,
        kind: 'tournament',
        holder: item.holder,
        what: `Torneo ${item.tournamentName}`,
        amount: item.due,
        ...played(item.startsAt),
        ...cash({ entryId: item.entryId, amount: String(item.due) }),
      })),
      ...input.unpaidPasses.map((item): BoardItem => ({
        id: item.passId,
        kind: 'day_use',
        holder: item.holder,
        what: item.productName,
        amount: item.due,
        ...played(item.startsAt),
        ...cash({ passId: item.passId, amount: String(item.due) }),
      })),
      ...input.unpaidChampionships.map((item): BoardItem => ({
        id: item.entryId,
        kind: 'championship',
        holder: item.holder,
        what: item.what,
        amount: item.due,
        ...played(item.startsAt),
        ...cash({ entryId: item.entryId, amount: String(item.due) }),
      })),
    ].sort(oldestFirst),
    transfers: input.transfers
      .map((transfer): BoardItem => ({
        id: transfer.id,
        kind: transfer.kind,
        holder: transfer.holder,
        what: transfer.courtName,
        when: transfer.startsAt ? format.when(transfer.startsAt) : '',
        at: transfer.startsAt?.getTime() ?? 0,
        amount: transfer.amount,
        action: { type: 'review', receiptUrl: transfer.receiptUrl },
      }))
      .sort(oldestFirst),
    collected: input.doneToday.confirmed.map(done).sort(latestFirst),
    refunds: input.refunds
      .map((item): BoardItem => ({
        id: item.paymentId,
        kind: item.kind,
        holder: item.holder,
        what: item.courtName,
        amount: item.amount,
        ...played(item.startsAt),
        action: { type: 'refund', fields: { paymentId: item.paymentId } },
      }))
      .sort(oldestFirst),
    refunded: input.doneToday.refunded.map(done).sort(latestFirst),
  }

  return COLUMNS.map((head) => withItems(head, items[head.key]))
}

export type BoardFilter = { query: string; kind: MoneyKind | '' }

// The board's search (by who or what, accents aside) and kind filter, on every column; counts follow what is shown.
export function filterBoard(columns: BoardColumn[], filter: BoardFilter): BoardColumn[] {
  const query = normalizeText(filter.query)
  if (!query && !filter.kind) return columns
  return columns.map((column) =>
    withItems(
      column,
      column.items.filter(
        (item) => (!filter.kind || item.kind === filter.kind) && (!query || normalizeText(`${item.holder} ${item.what}`).includes(query)),
      ),
    ),
  )
}

// What is still to do in a lane, for its tab on a phone.
export function pendingCount(columns: BoardColumn[], lane: LaneKey): number {
  return columns.filter((column) => column.lane === lane && !column.done).reduce((sum, column) => sum + column.count, 0)
}

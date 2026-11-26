import type { UnpaidChampionshipItem } from './championship-payments'
import type { UnpaidPassItem } from './day-use-payments'
import { normalizeText } from './members'
import type { DeskMethod, PaymentMethod } from './payments'
import { totalsOf, type MoneyKind, type RefundItem, type UnpaidItem } from './payments-overview'
import { addDays, localDateOf, zonedTime } from './time'
import type { UnpaidEntryItem } from './tournament-payments'

// Cobros as a board: what is owed, what is waiting and what got done today, in five columns and two lanes.

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

// A payment confirmed, refunded or rejected within the club's today.
export type DonePayment = {
  id: string
  kind: MoneyKind
  amount: number
  holder: string
  startsAt: Date | null
  courtName: string
  method: PaymentMethod
  confirmedAt: Date
  // Rejected ones: why.
  reason?: string | null
}

export type BoardInput = {
  transfers: ReportedTransfer[]
  unpaid: UnpaidItem[]
  unpaidEntries: UnpaidEntryItem[]
  unpaidPasses: UnpaidPassItem[]
  unpaidChampionships: UnpaidChampionshipItem[]
  refunds: (RefundItem & { kind: MoneyKind })[]
  doneToday: { confirmed: DonePayment[]; refunded: DonePayment[]; rejected: DonePayment[] }
}

// What the card's button does: charge at the desk (one button per method the club takes), give money back, or open the
// transfer's review.
export type ItemAction =
  | { type: 'charge'; fields: Record<string, string>; methods: DeskMethod[] }
  | { type: 'refund'; fields: Record<string, string> }
  | { type: 'review'; receiptUrl: string | null }
  // A cash or POS charge of today, taken back (void_desk_payment).
  | { type: 'void'; fields: Record<string, string> }

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
  // A championship pair's debt: both names, so it shows with each player who owes something else too.
  players?: string[]
  // Done columns only: how the money moved and at what time; `rejection` (the reason) when it was turned down.
  done?: { method: PaymentMethod; time: string; rejection?: string }
}

export type ColumnKey = 'unpaid' | 'transfers' | 'collected' | 'rejected' | 'refunds' | 'refunded'
export type LaneKey = 'collect' | 'giveBack'

type ColumnHead = { key: ColumnKey; lane: LaneKey; title: string; emptyText: string; done: boolean }
// `cash` and `card`: done columns only, the part of the total that moved in cash (what the till should hold) and by POS.
export type BoardColumn = ColumnHead & { items: BoardItem[]; count: number; total: number; cash?: number; card?: number }

export const KIND_LABELS: Record<MoneyKind, string> = {
  booking: 'Reserva',
  tournament: 'Torneo',
  day_use: 'Day use',
  championship: 'Campeonato',
}

export { METHOD_LABELS } from './payments'

export const LANES: { key: LaneKey; title: string }[] = [
  { key: 'collect', title: 'Cobrar' },
  { key: 'giveBack', title: 'Devolver' },
]

const COLUMNS: ColumnHead[] = [
  { key: 'unpaid', lane: 'collect', title: 'Sin cobrar', emptyText: 'Nada pendiente en los últimos 30 días.', done: false },
  { key: 'transfers', lane: 'collect', title: 'Por confirmar', emptyText: 'No hay transferencias para confirmar.', done: false },
  { key: 'collected', lane: 'collect', title: 'Cobrado hoy', emptyText: 'Todavía no se cobró nada hoy.', done: true },
  { key: 'rejected', lane: 'collect', title: 'Rechazado hoy', emptyText: 'No se rechazó nada hoy.', done: true },
  { key: 'refunds', lane: 'giveBack', title: 'A devolver', emptyText: 'No hay devoluciones pendientes.', done: false },
  { key: 'refunded', lane: 'giveBack', title: 'Devuelto hoy', emptyText: 'Nada devuelto hoy.', done: true },
]

// The club's today, from its local midnight to the next.
export function clubDayRange(now: Date, timeZone: string): { from: Date; to: Date } {
  const today = localDateOf(now, timeZone)
  return { from: zonedTime(today, 0, timeZone), to: zonedTime(addDays(today, 1), 0, timeZone) }
}

// The page owns how dates read and what the club takes at the desk.
export type BoardFormat = { when: (instant: Date) => string; time: (instant: Date) => string; deskMethods: DeskMethod[] }

const oldestFirst = (a: BoardItem, b: BoardItem) => a.at - b.at
const latestFirst = (a: BoardItem, b: BoardItem) => b.at - a.at

function withItems(head: ColumnHead, items: BoardItem[]): BoardColumn {
  const column: BoardColumn = { ...head, items, ...totalsOf(items, (item) => item.amount) }
  // The till: what came in and what went back; a rejected transfer never moved money.
  if (head.key === 'collected' || head.key === 'refunded') {
    const moved = (method: PaymentMethod) => totalsOf(items, (item) => (item.done?.method === method ? item.amount : 0)).total
    column.cash = moved('cash')
    column.card = moved('card')
  }
  return column
}

export function paymentsBoard(input: BoardInput, format: BoardFormat): BoardColumn[] {
  const cash = (fields: Record<string, string>): Pick<BoardItem, 'action'> =>
    format.deskMethods.length > 0 ? { action: { type: 'charge', fields, methods: format.deskMethods } } : {}
  const played = (startsAt: Date) => ({ when: format.when(startsAt), at: startsAt.getTime() })
  const done = (payment: DonePayment, rejection?: string): BoardItem => ({
    id: payment.id,
    kind: payment.kind,
    holder: payment.holder,
    what: payment.courtName,
    when: payment.startsAt ? format.when(payment.startsAt) : '',
    at: payment.confirmedAt.getTime(),
    amount: payment.amount,
    done: { method: payment.method, time: format.time(payment.confirmedAt), ...(rejection ? { rejection } : {}) },
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
        // Cobros already says "Torneo" next to it.
        what: item.tournamentName,
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
        players: item.players,
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
    collected: input.doneToday.confirmed
      .map((payment): BoardItem => ({
        ...done(payment),
        ...(payment.method === 'transfer' ? {} : { action: { type: 'void', fields: { paymentId: payment.id } } }),
      }))
      .sort(latestFirst),
    rejected: input.doneToday.rejected.map((payment) => done(payment, payment.reason?.trim() || 'Sin motivo')).sort(latestFirst),
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
    refunded: input.doneToday.refunded.map((payment) => done(payment)).sort(latestFirst),
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

// Sin cobrar, the way reception reads it: one entry per player, today and older days together, so the same name
// shows once ("Sofía Cabrera · 3 deudas · $3.600"). A championship pair's debt goes inside the entry of each of
// its players who owes something else (either can pay it; charged once, it leaves both); a pair debt with nobody else
// to join stays its own entry. Whoever owes from today comes first, in the order they played; then the rest, the
// oldest debt first. A single debt is a plain row: a group of one only adds a tap.
export type DebtGroup = { holder: string; items: BoardItem[]; total: number; today: boolean }

export function debtsByPlayer(items: BoardItem[], todayFrom: number): DebtGroup[] {
  const sorted = [...items].sort(oldestFirst)
  const byHolder = new Map<string, BoardItem[]>()
  const add = (key: string, item: BoardItem) => byHolder.set(key, [...(byHolder.get(key) ?? []), item])
  for (const item of sorted.filter((candidate) => !candidate.players)) add(normalizeText(item.holder), item)
  for (const item of sorted.filter((candidate) => candidate.players)) {
    const owners = (item.players ?? []).map(normalizeText).filter((key) => byHolder.has(key))
    if (owners.length === 0) add(normalizeText(item.holder), item)
    for (const key of owners) add(key, item)
  }
  const groups = [...byHolder.values()].map((list) => {
    const own = list.find((item) => !item.players) ?? list[0]
    const ordered = [...list].sort(oldestFirst)
    return {
      holder: own.holder,
      items: ordered,
      total: totalsOf(ordered, (item) => item.amount).total,
      today: ordered.some((item) => item.at >= todayFrom),
    }
  })
  const firstToday = (group: DebtGroup) => group.items.find((item) => item.at >= todayFrom)?.at ?? 0
  return [
    ...groups.filter((group) => group.today).sort((a, b) => firstToday(a) - firstToday(b)),
    ...groups.filter((group) => !group.today).sort((a, b) => a.items[0].at - b.items[0].at),
  ]
}

// What each person owes, for the club Inicio: by name (accents and case aside), each debt with the booking it belongs
// to (null for a tournament, a pass or a championship), so a turn's row can tell "+3 deudas más" apart from its own.
export type PersonDebt = { bookingId: string | null; amount: number }

export function debtsByName(items: BoardItem[]): Record<string, PersonDebt[]> {
  const byName: Record<string, PersonDebt[]> = {}
  for (const item of items) {
    const debt = { bookingId: item.action?.type === 'charge' ? (item.action.fields.bookingId ?? null) : null, amount: item.amount }
    for (const name of item.players ?? [item.holder]) {
      const key = normalizeText(name)
      byName[key] = [...(byName[key] ?? []), debt]
    }
  }
  return byName
}

// The debts of a person other than the turn in front of reception: what Inicio would let walk out.
export function otherDebts(byName: Record<string, PersonDebt[]>, name: string, bookingId: string): { count: number; total: number } {
  const others = (byName[normalizeText(name)] ?? []).filter((debt) => debt.bookingId !== bookingId)
  return { count: others.length, total: others.reduce((sum, debt) => sum + debt.amount, 0) }
}

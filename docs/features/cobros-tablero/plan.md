---
feature: cobros-tablero
type: plan
status: done
date: 2026-11-23
branch: feat/cobros-tablero
references: ./design.md
---

# Cobros tablero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `/team-setup:execute` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cobros (`/club/cobros`) becomes a board: two lanes (`Cobrar`: Sin cobrar → Por confirmar → Cobrado hoy; `Devolver`: A devolver → Devuelto hoy), each payment in the column of its state, moving right after reception acts on it.

**Architecture:** No migration. A pure module, `lib/domain/payments-board.ts`, turns the Cobros overview plus the payments done today into five columns (items, count, total, sorting, search and kind filter). `loadPaymentsOverview` reads one more query (payments `confirmed`/`refunded` with `confirmed_at` within the club's today) with the same select as the reported transfers, factored into `PAYMENT_SELECT`. The page builds the columns (it owns date formatting and the cash rule) and hands them to a client `PaymentsBoard` (lanes, tabs on a phone, search and filter) that draws each payment with `BoardCard` and reuses `TransferReviewCard` in the sheet. `MoneyTable`, `TransfersTable` and `PaymentsSection`/`SummaryTile` are deleted.

**Tech Stack:** Next.js 16 (App Router, Server Components, Server Actions), React 19, TypeScript, Tailwind 4, Supabase, Vitest + Testing Library, Playwright.

---

## Before you start

- Branch: `feat/cobros-tablero`. Run every task in order without asking between tasks; each one ends green and in a commit.
- **The tree has changes that are not this feature's** (`supabase/config.toml`): never stage them. Always `git add` the exact paths of the task, never `git add -A` or `git add .`.
- **This plan was checked before it was written**: the code of Tasks 1–6, applied in a scratch worktree, passed the whole Vitest suite (1057 tests), `npm run typecheck` and `npm run lint`. The e2e of Task 6 was typed and linted but not run (port 3000 was busy): it runs in Task 6.
- Next 16: the plan uses no new Next API, only a Server Component page that passes Server Actions to a client component (as the page does today). Before touching the page, read `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`.
- Windows: run Vitest, Playwright and typecheck from PowerShell. Paths with parentheses (`app/(club)/…`) go in quotes in bash. Write files with the Write/Edit tools, not heredocs.
- Checks of each task: `npx vitest run <files>`, `npm run typecheck`, `npm run lint`.
- UI copy in Rioplatense Spanish; code comments in English.

## File map

| File | Change | Responsibility |
|---|---|---|
| `lib/domain/payments-board.ts` | create | Types (`ReportedTransfer`, `DonePayment`, `BoardInput`, `BoardItem`, `BoardColumn`), `clubDayRange`, `paymentsBoard`, `filterBoard`, `pendingCount`, `KIND_LABELS`, `METHOD_LABELS`, `LANES` |
| `tests/unit/lib/domain/payments-board.test.ts` | create | Domain tests |
| `lib/data/payments.ts` | modify | `PAYMENT_SELECT`, `kind` on transfers, `doneToday` query; `PaymentsOverview = BoardInput` |
| `app/(club)/club/cobros/board-card.tsx` | create | One card: who, kind, what, when, amount; method and time when done; action slot |
| `app/(club)/club/cobros/payments-board.tsx` | create | Client board: search + kind filter, phone tabs, lanes, columns, card actions, review sheet |
| `app/(club)/club/cobros/transfer-review-card.tsx` | modify | Takes `PaymentItemHead` in (its only user) |
| `app/(club)/club/cobros/page.tsx` | rewrite | Builds the columns, renders `PaymentsBoard` |
| `app/(club)/club/cobros/{money-table,transfers-table,payments-section}.tsx` + their tests | delete | Replaced by the board |
| `tests/unit/app/cobros/{board-card,payments-board}.test.tsx` | create | Component tests |
| `tests/e2e/cobros-board.spec.ts` | create | Cash and transfer moving to Cobrado hoy |
| `tests/e2e/{club-home,reception-grid}.spec.ts` | modify | Region `Transferencias para confirmar` → `Por confirmar` |

---

### Task 1: Board domain

**Files:**
- Create: `lib/domain/payments-board.ts`
- Test: `tests/unit/lib/domain/payments-board.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/lib/domain/payments-board.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  clubDayRange,
  filterBoard,
  paymentsBoard,
  pendingCount,
  type BoardColumn,
  type BoardFormat,
  type BoardInput,
  type ColumnKey,
} from '@/lib/domain/payments-board'

const at = (iso: string) => new Date(iso)
const FORMAT: BoardFormat = {
  when: (instant) => `día ${instant.toISOString().slice(0, 10)}`,
  time: (instant) => instant.toISOString().slice(11, 16),
  acceptsCash: true,
}

function input(overrides: Partial<BoardInput> = {}): BoardInput {
  return {
    transfers: [
      { id: 't2', kind: 'tournament', amount: 400, holder: 'Bruno Silva', startsAt: at('2026-11-20T21:00:00Z'), courtName: 'Torneo Americano', receiptUrl: null },
      { id: 't1', kind: 'booking', amount: 1600, holder: 'Ana López', startsAt: at('2026-11-19T23:00:00Z'), courtName: 'Cancha 1', receiptUrl: 'https://x/r1.png' },
    ],
    unpaid: [{ bookingId: 'b1', holder: 'Martina', startsAt: at('2026-11-21T23:00:00Z'), courtName: 'Cancha 2', due: 1200, payerId: 'u1' }],
    unpaidEntries: [{ entryId: 'e1', holder: 'Diego', startsAt: at('2026-11-18T21:00:00Z'), tournamentName: 'Relámpago', due: 500 }],
    unpaidPasses: [{ passId: 'p1', holder: 'Carla Ruiz', startsAt: at('2026-11-22T17:00:00Z'), productName: 'Day use pádel', due: 450 }],
    unpaidChampionships: [{ entryId: 'c1', holder: 'Eva y Flor', startsAt: at('2026-11-15T11:00:00Z'), what: 'Campeonato Primavera · 6ta', due: 2000 }],
    refunds: [{ paymentId: 'r1', kind: 'booking', holder: 'Gabi', startsAt: at('2026-11-24T23:00:00Z'), courtName: 'Cancha 3', amount: 800 }],
    doneToday: {
      confirmed: [
        { id: 'd1', kind: 'booking', amount: 300, holder: 'Hugo', startsAt: at('2026-11-23T13:00:00Z'), courtName: 'Cancha 1', method: 'cash', confirmedAt: at('2026-11-23T14:10:00Z') },
        { id: 'd2', kind: 'day_use', amount: 450, holder: 'Inés', startsAt: null, courtName: 'Day use pádel', method: 'transfer', confirmedAt: at('2026-11-23T15:30:00Z') },
      ],
      refunded: [
        { id: 'd3', kind: 'booking', amount: 800, holder: 'Juan', startsAt: at('2026-11-25T23:00:00Z'), courtName: 'Cancha 2', method: 'cash', confirmedAt: at('2026-11-23T12:00:00Z') },
      ],
    },
    ...overrides,
  }
}

const column = (columns: BoardColumn[], key: ColumnKey) => columns.find((item) => item.key === key) as BoardColumn

describe('clubDayRange', () => {
  it('runs from the club’s local midnight to the next', () => {
    // 23:30 of the 22nd in Montevideo (UTC-3).
    expect(clubDayRange(at('2026-11-23T02:30:00Z'), 'America/Montevideo')).toEqual({
      from: at('2026-11-22T03:00:00Z'),
      to: at('2026-11-23T03:00:00Z'),
    })
  })
})

describe('paymentsBoard', () => {
  it('lays out the five columns in their lanes, the done ones marked', () => {
    const columns = paymentsBoard(input(), FORMAT)
    expect(columns.map((item) => [item.lane, item.title, item.done])).toEqual([
      ['collect', 'Sin cobrar', false],
      ['collect', 'Por confirmar', false],
      ['collect', 'Cobrado hoy', true],
      ['giveBack', 'A devolver', false],
      ['giveBack', 'Devuelto hoy', true],
    ])
  })

  it('puts every kind of debt in Sin cobrar, oldest first, with its cash action and the total', () => {
    const unpaid = column(paymentsBoard(input(), FORMAT), 'unpaid')
    expect(unpaid.items.map((item) => [item.holder, item.kind, item.what])).toEqual([
      ['Eva y Flor', 'championship', 'Campeonato Primavera · 6ta'],
      ['Diego', 'tournament', 'Torneo Relámpago'],
      ['Martina', 'booking', 'Cancha 2'],
      ['Carla Ruiz', 'day_use', 'Day use pádel'],
    ])
    expect(unpaid.items[2]).toMatchObject({
      id: 'b1-u1',
      when: 'día 2026-11-21',
      amount: 1200,
      action: { type: 'cash', fields: { bookingId: 'b1', amount: '1200', payerId: 'u1' } },
    })
    expect(unpaid.items[3].action).toEqual({ type: 'cash', fields: { passId: 'p1', amount: '450' } })
    expect([unpaid.count, unpaid.total]).toEqual([4, 4150])
  })

  it('offers no cash action when the club takes no cash', () => {
    const unpaid = column(paymentsBoard(input(), { ...FORMAT, acceptsCash: false }), 'unpaid')
    expect(unpaid.items.every((item) => item.action === undefined)).toBe(true)
  })

  it('lists the transfers to confirm oldest first, each opening its review with the receipt', () => {
    const transfers = column(paymentsBoard(input(), FORMAT), 'transfers')
    expect(transfers.items.map((item) => item.id)).toEqual(['t1', 't2'])
    expect(transfers.items[0].action).toEqual({ type: 'review', receiptUrl: 'https://x/r1.png' })
    expect([transfers.count, transfers.total]).toEqual([2, 2000])
  })

  it('lists the payments to give back with the refund action', () => {
    const refunds = column(paymentsBoard(input(), FORMAT), 'refunds')
    expect(refunds.items).toEqual([
      expect.objectContaining({ id: 'r1', holder: 'Gabi', action: { type: 'refund', fields: { paymentId: 'r1' } } }),
    ])
  })

  it('shows what got done today, latest first, with the method and the time and no action', () => {
    const columns = paymentsBoard(input(), FORMAT)
    const collected = column(columns, 'collected')
    expect(collected.items.map((item) => [item.holder, item.done, item.action, item.when])).toEqual([
      ['Inés', { method: 'transfer', time: '15:30' }, undefined, ''],
      ['Hugo', { method: 'cash', time: '14:10' }, undefined, 'día 2026-11-23'],
    ])
    expect([collected.count, collected.total]).toEqual([2, 750])
    expect(column(columns, 'refunded').items.map((item) => item.holder)).toEqual(['Juan'])
  })
})

describe('filterBoard', () => {
  const columns = paymentsBoard(input(), FORMAT)

  it('leaves the board as is without a search or a kind', () => {
    expect(filterBoard(columns, { query: '  ', kind: '' })).toBe(columns)
  })

  it('searches who or what in every column, accents aside, and recounts', () => {
    const shown = filterBoard(columns, { query: 'cancha 1', kind: '' })
    expect(shown.map((item) => item.items.map((card) => card.holder))).toEqual([[], ['Ana López'], ['Hugo'], [], []])
    expect(column(shown, 'collected').total).toBe(300)
    expect(column(filterBoard(columns, { query: 'ines', kind: '' }), 'collected').items.map((item) => item.holder)).toEqual(['Inés'])
  })

  it('keeps one kind', () => {
    const shown = filterBoard(columns, { query: '', kind: 'day_use' })
    expect(shown.map((item) => item.count)).toEqual([1, 0, 1, 0, 0])
  })
})

describe('pendingCount', () => {
  it('counts what is still to do in a lane, not what got done', () => {
    const columns = paymentsBoard(input(), FORMAT)
    expect(pendingCount(columns, 'collect')).toBe(6)
    expect(pendingCount(columns, 'giveBack')).toBe(1)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run (PowerShell): `npx vitest run tests/unit/lib/domain/payments-board.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/domain/payments-board"`.

- [ ] **Step 3: Write the module**

Create `lib/domain/payments-board.ts`:

```ts
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
export type BoardColumn = ColumnHead & { items: BoardItem[]; count: number; total: number }

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
  return { ...head, items, ...totalsOf(items, (item) => item.amount) }
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
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run tests/unit/lib/domain/payments-board.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/payments-board.ts tests/unit/lib/domain/payments-board.test.ts
git commit -m "feat(cobros): board domain, five columns in two lanes with today in the club's timezone"
```

---

### Task 2: Data loader reads what got done today

`lib/data/payments.ts` has no unit tests (it talks to Supabase); typecheck covers the shape and the e2e in Task 6 covers the query.

**Files:**
- Modify: `lib/data/payments.ts`

- [ ] **Step 1: Swap the imports and the overview type**

Replace lines 3–39 (the championship/day-use/payments-overview/tournament imports, `ReportedTransfer` and `PaymentsOverview`) so the top of the file reads:

```ts
import 'server-only'
import type { Club } from '@/lib/auth/viewer'
import { championshipRefunds, overviewStartsAt, unpaidChampionshipEntries } from '@/lib/domain/championship-payments'
import { passRefunds, passStartsAt, unpaidPasses } from '@/lib/domain/day-use-payments'
import { clubDayRange, type BoardInput, type DonePayment } from '@/lib/domain/payments-board'
import { holderLabel, leftPlayerRefunds, refundsDue, unpaidBookings, type MoneyKind } from '@/lib/domain/payments-overview'
import { localDateOf, toDate } from '@/lib/domain/time'
import { entryRefunds, unpaidEntries } from '@/lib/domain/tournament-payments'
import { createClient } from '@/lib/supabase/server'

// Everything the Cobros board shows.
export type PaymentsOverview = BoardInput
```

(`RECEIPT_URL_SECONDS`, `BOOKING_SELECT`, `PASS_SELECT` and `CHAMPIONSHIP_SELECT` stay as they are.)

- [ ] **Step 2: Factor the payment select and add the done-today query**

Replace, from the comment `// Everything the Cobros screen needs, read with the staff session.` down to the `.order('created_at'),` of the reported-payments query, with:

```ts
// A payment with what it was for (a booking, a tournament entry, a day use pass or a championship pair): the
// transfers to confirm and the payments done today.
const PAYMENT_SELECT =
  'id, amount, method, status, confirmed_at, receipt_path, payer:profiles!payments_payer_id_fkey(display_name), booking:bookings(starts_at, guest_name, court:courts(name), player:profiles!bookings_player_id_fkey(display_name)), entry:tournament_entries!payments_entry_in_club(tournament:tournaments!tournament_entries_tournament_in_club(name, starts_at)), pass:day_use_passes!payments_pass_in_club(on_date, product:day_use_products!day_use_passes_product_in_club(name, from_time)), pair:championship_entries!payments_championship_entry_in_club(category:championship_categories!championship_entries_category_in_club(name, championship:championships!championship_categories_championship_in_club(name, windows:championship_windows!championship_windows_championship_in_club(on_date, from_time))))'

// Everything the Cobros screen needs, read with the staff session.
export async function loadPaymentsOverview(club: Club, now = new Date()): Promise<PaymentsOverview> {
  const supabase = await createClient()
  const since = new Date(now.getTime() - 30 * 86_400_000)
  const today = clubDayRange(now, club.timezone)

  const [reported, paidToday, played, cancelled, matchBookings, tournaments, passes, championships] = await Promise.all([
    supabase.from('payments').select(PAYMENT_SELECT).eq('club_id', club.id).eq('status', 'reported').order('created_at'),
    // Confirmed or given back today, wherever it was done: the day's till.
    supabase
      .from('payments')
      .select(PAYMENT_SELECT)
      .eq('club_id', club.id)
      .in('status', ['confirmed', 'refunded'])
      .gte('confirmed_at', today.from.toISOString())
      .lt('confirmed_at', today.to.toISOString()),
```

The rest of the `Promise.all` list (`played`, `cancelled`, …) stays as it is.

- [ ] **Step 3: Check the new query's error**

Right after `if (reported.error) throw reported.error` add:

```ts
  if (paidToday.error) throw paidToday.error
```

- [ ] **Step 4: Share the payment mapping and return `doneToday`**

Replace the `return {` and its whole `transfers: reported.data.map((payment) => { … }),` entry (down to and including `}),` before `unpaid: unpaidBookings(played.data),`) with:

```ts
  type PaymentRow = (typeof reported.data)[number]
  const kindOf = (payment: PaymentRow): MoneyKind =>
    payment.entry ? 'tournament' : payment.pass ? 'day_use' : payment.pair ? 'championship' : 'booking'
  // Who paid, for what, and when it is played, whatever the payment was for.
  const paymentFor = (payment: PaymentRow) => {
    const tournament = payment.entry?.tournament ?? null
    const pass = payment.pass ?? null
    const category = payment.pair?.category ?? null
    const championship = category?.championship ?? null
    return {
      id: payment.id,
      kind: kindOf(payment),
      amount: payment.amount,
      holder: payment.payer?.display_name ?? (payment.booking ? holderLabel(payment.booking) : 'Sin nombre'),
      startsAt: payment.booking
        ? toDate(payment.booking.starts_at)
        : tournament
          ? toDate(tournament.starts_at)
          : pass
            ? passStartsAt(pass.on_date, pass.product?.from_time, club.timezone)
            : championship
              ? overviewStartsAt(championship, club.timezone)
              : null,
      courtName:
        payment.booking?.court?.name ??
        (tournament
          ? `Torneo ${tournament.name}`
          : pass
            ? (pass.product?.name ?? '')
            : championship && category
              ? `Campeonato ${championship.name} · ${category.name}`
              : ''),
    }
  }
  const done = (payment: PaymentRow): DonePayment => ({
    ...paymentFor(payment),
    method: payment.method,
    confirmedAt: toDate(payment.confirmed_at),
  })

  return {
    transfers: reported.data.map((payment) => ({
      ...paymentFor(payment),
      receiptUrl: payment.receipt_path ? (signedUrls.get(payment.receipt_path) ?? null) : null,
    })),
    doneToday: {
      confirmed: paidToday.data.filter((payment) => payment.status === 'confirmed').map(done),
      refunded: paidToday.data.filter((payment) => payment.status === 'refunded').map(done),
    },
```

`unpaid`, `unpaidEntries`, `unpaidPasses`, `unpaidChampionships` and `refunds` stay as they are.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck` then `npx eslint lib/data/payments.ts`
Expected: no errors (the current page only destructures fields that still exist).

- [ ] **Step 6: Commit**

```bash
git add lib/data/payments.ts
git commit -m "feat(cobros): load the payments confirmed and refunded today, transfers with their kind"
```

---

### Task 3: Board card

**Files:**
- Create: `app/(club)/club/cobros/board-card.tsx`
- Test: `tests/unit/app/cobros/board-card.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/app/cobros/board-card.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BoardCard } from '@/app/(club)/club/cobros/board-card'
import type { BoardItem } from '@/lib/domain/payments-board'

const ITEM: BoardItem = {
  id: 'b1-',
  kind: 'booking',
  holder: 'Ana López',
  what: 'Cancha 1',
  when: 'jueves 1 de octubre, 20:00',
  at: 1,
  amount: 1600,
}

describe('BoardCard', () => {
  it('shows who, what, when and how much, with its button', () => {
    render(
      <BoardCard item={ITEM}>
        <button type="button">Cobrar en efectivo</button>
      </BoardCard>,
    )
    const card = screen.getByRole('article', { name: 'Ana López' })
    expect(card).toHaveTextContent('Reserva')
    expect(card).toHaveTextContent('Cancha 1')
    expect(card).toHaveTextContent('jueves 1 de octubre, 20:00')
    expect(card).toHaveTextContent('$1.600')
    expect(screen.getByRole('button', { name: 'Cobrar en efectivo' })).toBeInTheDocument()
  })

  it('says how and when a done payment came in', () => {
    render(<BoardCard item={{ ...ITEM, when: '', done: { method: 'transfer', time: '18:40' } }} />)
    expect(screen.getByRole('article', { name: 'Ana López' })).toHaveTextContent('Transferencia · 18:40')
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/unit/app/cobros/board-card.test.tsx`
Expected: FAIL — cannot resolve `@/app/(club)/club/cobros/board-card`.

- [ ] **Step 3: Write the component**

Create `app/(club)/club/cobros/board-card.tsx`:

```tsx
import type { ReactNode } from 'react'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/domain/format'
import { KIND_LABELS, METHOD_LABELS, type BoardItem } from '@/lib/domain/payments-board'

// One payment on the Cobros board: who, what, when and how much; its button below, or how it came in once done.
export function BoardCard({ item, children }: { item: BoardItem; children?: ReactNode }) {
  return (
    <article
      aria-label={item.holder}
      className={cn('flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3', item.done && 'border-transparent bg-bg')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{item.holder}</p>
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{KIND_LABELS[item.kind]}</p>
          {item.what ? <p className="text-sm">{item.what}</p> : null}
          {item.when ? <p className="text-sm text-fg-muted">{item.when}</p> : null}
        </div>
        <p className={cn('shrink-0 font-display text-xl font-bold tabular-nums', item.done && 'text-fg-muted')}>{formatPrice(item.amount)}</p>
      </div>
      {item.done ? (
        <p className="flex items-center gap-1.5 text-sm text-fg-muted">
          <Icon name="check-circle" className="size-4 text-court-ink" />
          {METHOD_LABELS[item.done.method]} · {item.done.time}
        </p>
      ) : null}
      {children}
    </article>
  )
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run tests/unit/app/cobros/board-card.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add "app/(club)/club/cobros/board-card.tsx" tests/unit/app/cobros/board-card.test.tsx
git commit -m "feat(cobros): board card, done ones with their method and time"
```

---

### Task 4: Payments board (client)

**Files:**
- Create: `app/(club)/club/cobros/payments-board.tsx`
- Test: `tests/unit/app/cobros/payments-board.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/app/cobros/payments-board.test.tsx`:

```tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PaymentsBoard, type BoardActions } from '@/app/(club)/club/cobros/payments-board'
import type { FormAction } from '@/components/ui/action-form'
import { paymentsBoard, type BoardInput } from '@/lib/domain/payments-board'

const at = (iso: string) => new Date(iso)

const INPUT: BoardInput = {
  transfers: [
    { id: 't1', kind: 'booking', amount: 1600, holder: 'Ana López', startsAt: at('2026-11-19T23:00:00Z'), courtName: 'Cancha 1', receiptUrl: 'https://x/r1.png' },
  ],
  unpaid: [{ bookingId: 'b1', holder: 'Martina', startsAt: at('2026-11-21T23:00:00Z'), courtName: 'Cancha 2', due: 1200 }],
  unpaidEntries: [],
  unpaidPasses: [{ passId: 'p1', holder: 'Carla Ruiz', startsAt: at('2026-11-22T17:00:00Z'), productName: 'Day use pádel', due: 450 }],
  unpaidChampionships: [],
  refunds: [{ paymentId: 'r1', kind: 'booking', holder: 'Gabi', startsAt: at('2026-11-24T23:00:00Z'), courtName: 'Cancha 3', amount: 800 }],
  doneToday: {
    confirmed: [
      { id: 'd1', kind: 'booking', amount: 300, holder: 'Hugo', startsAt: null, courtName: 'Cancha 1', method: 'cash', confirmedAt: at('2026-11-23T14:10:00Z') },
    ],
    refunded: [],
  },
}

const COLUMNS = paymentsBoard(INPUT, {
  when: (instant) => instant.toISOString().slice(0, 10),
  time: (instant) => instant.toISOString().slice(11, 16),
  acceptsCash: true,
})

function renderBoard() {
  const ok = (message: string) => vi.fn<FormAction>(async () => ({ status: 'ok', message }))
  const actions = {
    cash: { booking: ok('Cobrado.'), tournament: ok('Cobrado.'), day_use: ok('Cobrado.'), championship: ok('Cobrado.') },
    refund: ok('Devolución registrada.'),
    confirm: ok('Pago confirmado.'),
    reject: ok('Transferencia rechazada.'),
  } satisfies BoardActions
  render(<PaymentsBoard columns={COLUMNS} actions={actions} />)
  return actions
}

const column = (name: string) => screen.getByRole('region', { name })

describe('PaymentsBoard', () => {
  it('shows the five columns with their count and total, an empty one with its line', () => {
    renderBoard()
    expect(within(column('Sin cobrar')).getByText('2 · $1.650')).toBeInTheDocument()
    expect(within(column('Por confirmar')).getByRole('article', { name: 'Ana López' })).toBeInTheDocument()
    expect(within(column('Cobrado hoy')).getByRole('article', { name: 'Hugo' })).toHaveTextContent('Efectivo · 14:10')
    expect(within(column('A devolver')).getByRole('article', { name: 'Gabi' })).toBeInTheDocument()
    expect(column('Devuelto hoy')).toHaveTextContent('Nada devuelto hoy.')
  })

  it('takes cash with the action of the item’s kind, and marks a refund', async () => {
    const actions = renderBoard()
    const carla = within(column('Sin cobrar')).getByRole('article', { name: 'Carla Ruiz' })
    await userEvent.click(within(carla).getByRole('button', { name: 'Cobrar en efectivo' }))
    await waitFor(() => expect(actions.cash.day_use).toHaveBeenCalledTimes(1))
    expect(Object.fromEntries(actions.cash.day_use.mock.calls[0][1].entries())).toEqual({ passId: 'p1', amount: '450' })
    expect(actions.cash.booking).not.toHaveBeenCalled()

    await userEvent.click(within(column('A devolver')).getByRole('button', { name: 'Marcar devuelto' }))
    await waitFor(() => expect(actions.refund).toHaveBeenCalledTimes(1))
    expect(actions.refund.mock.calls[0][1].get('paymentId')).toBe('r1')
  })

  it('reviews a transfer in a sheet that keeps its outcome', async () => {
    const actions = renderBoard()
    const transfers = column('Por confirmar')
    expect(within(transfers).getByRole('link', { name: 'Ver comprobante de Ana López' })).toHaveAttribute('href', 'https://x/r1.png')
    await userEvent.click(within(transfers).getByRole('button', { name: 'Revisar la transferencia de Ana López' }))
    const sheet = screen.getByRole('dialog', { name: 'Transferencia de Ana López' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(actions.confirm).toHaveBeenCalledTimes(1))
    expect(actions.confirm.mock.calls[0][1].get('paymentId')).toBe('t1')
    expect(await within(sheet).findByRole('status')).toHaveTextContent('Pago confirmado.')
  })

  it('switches lanes with the tabs on a phone, each with what is left to do', async () => {
    renderBoard()
    const collect = screen.getByRole('tab', { name: 'Cobrar 3' })
    const giveBack = screen.getByRole('tab', { name: 'Devolver 1' })
    expect(collect).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('region', { name: 'Devolver' })).toHaveClass('hidden')
    await userEvent.click(giveBack)
    expect(giveBack).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('region', { name: 'Cobrar' })).toHaveClass('hidden')
    expect(screen.getByRole('region', { name: 'Devolver' })).not.toHaveClass('hidden')
  })

  it('searches and filters every column at once', async () => {
    renderBoard()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar por nombre' }), 'cancha 1')
    expect(within(column('Por confirmar')).getByRole('article', { name: 'Ana López' })).toBeInTheDocument()
    expect(within(column('Cobrado hoy')).getByRole('article', { name: 'Hugo' })).toBeInTheDocument()
    expect(column('Sin cobrar')).toHaveTextContent('Nada coincide con la búsqueda.')

    await userEvent.clear(screen.getByRole('searchbox', { name: 'Buscar por nombre' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Tipo' }), 'day_use')
    expect(within(column('Sin cobrar')).getAllByRole('article')).toHaveLength(1)
    expect(within(column('Sin cobrar')).getByText('1 · $450')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/unit/app/cobros/payments-board.test.tsx`
Expected: FAIL — cannot resolve `@/app/(club)/club/cobros/payments-board`.

- [ ] **Step 3: Write the component**

Create `app/(club)/club/cobros/payments-board.tsx`. Notes: the sheet keeps a **copy** of the reviewed transfer, so after confirming (the action revalidates and the card leaves `Por confirmar`) the sheet still shows the outcome until reception closes it. The lane that is not selected gets `hidden` on a phone and `md:flex` brings both back from `md` up.

```tsx
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
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run tests/unit/app/cobros/payments-board.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add "app/(club)/club/cobros/payments-board.tsx" tests/unit/app/cobros/payments-board.test.tsx
git commit -m "feat(cobros): payments board with lanes, phone tabs, search and the review sheet"
```

---

### Task 5: The page shows the board; the tables go

`# (no new test — the page is wiring; Tasks 1, 3 and 4 cover the logic and the UI, Task 6 the page end to end)`

**Files:**
- Modify: `app/(club)/club/cobros/transfer-review-card.tsx`
- Rewrite: `app/(club)/club/cobros/page.tsx`
- Delete: `app/(club)/club/cobros/money-table.tsx`, `app/(club)/club/cobros/transfers-table.tsx`, `app/(club)/club/cobros/payments-section.tsx`, `tests/unit/app/cobros/money-table.test.tsx`, `tests/unit/app/cobros/transfers-table.test.tsx`, `tests/unit/app/cobros/payments-section.test.tsx`

- [ ] **Step 1: Move `PaymentItemHead` into the review card (its only user)**

In `app/(club)/club/cobros/transfer-review-card.tsx` replace the import

```ts
import { PaymentItemHead } from './payments-section'
```

with

```ts
import { formatPrice } from '@/lib/domain/format'
```

and append at the end of the file:

```tsx

// Who, when, where and how much, at the top of the review.
function PaymentItemHead({ holder, when, courtName, amount, amountLabel }: {
  holder: string
  when: string
  courtName: string
  amount: number
  amountLabel: string
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-semibold">{holder}</p>
        <p className="flex items-center gap-1.5 text-sm text-fg-muted">
          <Icon name="calendar" className="size-4" />
          {when}
        </p>
        {courtName ? (
          <p className="flex items-center gap-1.5 text-sm text-fg-muted">
            <Icon name="pin" className="size-4" />
            {courtName}
          </p>
        ) : null}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs text-fg-muted">{amountLabel}</p>
        <p className="font-display text-2xl font-bold tabular-nums">{formatPrice(amount)}</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite the page**

Replace the whole of `app/(club)/club/cobros/page.tsx` with:

```tsx
import type { Metadata } from 'next'
import { requireStaff } from '@/lib/auth/viewer'
import { loadPaymentsOverview } from '@/lib/data/payments'
import { dayLongLabel, timeIn } from '@/lib/domain/format'
import { paymentsBoard } from '@/lib/domain/payments-board'
import { localDateOf } from '@/lib/domain/time'
import { recordCash } from '../grilla/actions'
import { recordPassCash } from '../day-use/actions'
import { recordChampionshipCash } from '../torneos/campeonatos/actions'
import { recordTournamentCash } from '../torneos/actions'
import { confirmPayment, refundPayment, rejectPayment } from './actions'
import { PaymentsBoard } from './payments-board'

export const metadata: Metadata = { title: 'Cobros' }

export default async function PaymentsPage() {
  const viewer = await requireStaff('/club/cobros')
  const { club } = viewer
  const columns = paymentsBoard(await loadPaymentsOverview(club), {
    when: (start) => `${dayLongLabel(localDateOf(start, club.timezone))}, ${timeIn(start, club.timezone)}`,
    time: (instant) => timeIn(instant, club.timezone),
    acceptsCash: club.accepts_cash,
  })

  return (
    <PaymentsBoard
      columns={columns}
      actions={{
        cash: { booking: recordCash, tournament: recordTournamentCash, day_use: recordPassCash, championship: recordChampionshipCash },
        refund: refundPayment,
        confirm: confirmPayment,
        reject: rejectPayment,
      }}
    />
  )
}
```

- [ ] **Step 3: Delete the tables and their tests**

```bash
git rm "app/(club)/club/cobros/money-table.tsx" "app/(club)/club/cobros/transfers-table.tsx" "app/(club)/club/cobros/payments-section.tsx" tests/unit/app/cobros/money-table.test.tsx tests/unit/app/cobros/transfers-table.test.tsx tests/unit/app/cobros/payments-section.test.tsx
```

- [ ] **Step 4: Check nothing else used them**

Use Grep for `money-table|transfers-table|payments-section|MONEY_KIND_LABELS|SummaryTile|PaymentsSection` over `app`, `lib`, `components`, `tests`.
Expected: no matches. (`totalsOf` and `PaymentsTotals` stay in `lib/domain/payments-overview.ts`: the board uses `totalsOf`.)

- [ ] **Step 5: Run the checks**

Run: `npx vitest run tests/unit/app/cobros tests/unit/lib/domain/payments-board.test.ts`, then `npm run typecheck`, then `npm run lint`
Expected: all green (cobros: `board-card`, `payments-board`, `transfer-review-card`).

- [ ] **Step 6: Commit**

```bash
git add "app/(club)/club/cobros/page.tsx" "app/(club)/club/cobros/transfer-review-card.tsx"
git commit -m "feat(cobros): the page is the board; the money tables and summary tiles go"
```

(The deletions are already staged by `git rm`.)

---

### Task 6: End to end

**Files:**
- Create: `tests/e2e/cobros-board.spec.ts`
- Modify: `tests/e2e/club-home.spec.ts:54`, `tests/e2e/reception-grid.spec.ts:29`

- [ ] **Step 1: Write the board e2e**

Create `tests/e2e/cobros-board.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { addDays, localDateOf } from '../../lib/domain/time'
import { clubRow, createMember } from './support/admin'
import { signInWithMagicLink } from './support/auth'
import { bookFirstFreeSlot, reportTransferAs } from './support/booking'
import { insertRecentBooking } from './support/club-home'

test('reception charges cash and confirms a transfer on the board, and both land in Cobrado hoy', async ({ page }) => {
  const club = await clubRow()
  const debtor = await createMember({ name: 'Paula Tablero E2E', prefix: 'tablero-deudora' })
  const payer = await createMember({ name: 'Tomás Tablero E2E', prefix: 'tablero-transfiere' })
  const reception = await createMember({ name: 'Recepción Tablero E2E', prefix: 'tablero-recepcion', role: 'reception' })
  const recent = await insertRecentBooking(debtor)
  test.skip(recent === null, 'El turno de hace un rato habría empezado ayer')
  const booked = await bookFirstFreeSlot(payer, addDays(localDateOf(new Date(), club.timezone), 4))
  await reportTransferAs(payer, booked.bookingId)

  await signInWithMagicLink(page, reception.email, '/club/cobros')
  const column = (name: string) => page.getByRole('region', { name, exact: true })

  // Cash on a Sin cobrar card: once the page refreshes, the card sits in Cobrado hoy.
  await column('Sin cobrar').getByRole('article', { name: debtor.name }).getByRole('button', { name: 'Cobrar en efectivo' }).click()
  await expect(column('Cobrado hoy').getByRole('article', { name: debtor.name })).toContainText('Efectivo')
  await expect(column('Sin cobrar').getByRole('article', { name: debtor.name })).toHaveCount(0)

  // A reported transfer: confirmed in its sheet, it leaves Por confirmar for Cobrado hoy.
  await column('Por confirmar').getByRole('button', { name: `Revisar la transferencia de ${payer.name}` }).click()
  const review = page.getByRole('dialog', { name: `Transferencia de ${payer.name}` })
  await review.getByRole('button', { name: 'Confirmar' }).click()
  await expect(review.getByRole('status')).toContainText('Pago confirmado')
  await review.getByRole('button', { name: 'Cerrar' }).click()
  await expect(column('Por confirmar').getByRole('article', { name: payer.name })).toHaveCount(0)
  await expect(column('Cobrado hoy').getByRole('article', { name: payer.name })).toContainText('Transferencia')
})
```

- [ ] **Step 2: Point the existing specs at the new column**

In `tests/e2e/club-home.spec.ts` (line 54) and `tests/e2e/reception-grid.spec.ts` (line 29) replace

```ts
page.getByRole('region', { name: 'Transferencias para confirmar' })
```

with

```ts
page.getByRole('region', { name: 'Por confirmar', exact: true })
```

(`exact` matters: Playwright matches names by substring, and the lane `Cobrar` and column `Sin cobrar` share words with other regions. The receipt link `Ver comprobante de …` and the button `Revisar la transferencia de …` keep their names on the card, so the rest of `reception-grid.spec.ts` works as it is.)

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck`, then `npx eslint tests/e2e`
Expected: no errors.

- [ ] **Step 4: Run the affected e2e**

Needs local Supabase running (`npx supabase status`) and port 3000 free (stop any `next dev`; Playwright starts its own and `reuseExistingServer` is false).
Run (PowerShell): `npx playwright test tests/e2e/cobros-board.spec.ts tests/e2e/reception-grid.spec.ts tests/e2e/club-home.spec.ts --reporter=line`
Expected: PASS (the board spec and the `club-home` "recent" spec skip themselves within the first 70 minutes after the club's midnight).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/cobros-board.spec.ts tests/e2e/club-home.spec.ts tests/e2e/reception-grid.spec.ts
git commit -m "test(cobros): e2e of cash and a transfer moving to Cobrado hoy on the board"
```

---

### Task 7: Final check and close the plan

- [ ] **Step 1: Run the whole suite**

Run (PowerShell): `npx vitest run`, `npm run typecheck`, `npm run lint`
Expected: all green.

- [ ] **Step 2: Look at it**

Start the app (`npm run dev`), open `/club/cobros` as reception on a phone width (390px) and on desktop: the two tabs with their counts on the phone; both lanes, columns side by side, from `md` up; done cards muted with ✓ and method; empty columns with their dashed line.

- [ ] **Step 3: Mark the plan done**

In `docs/features/cobros-tablero/plan.md` change `status: in-progress` to `status: done` in the frontmatter.

- [ ] **Step 4: Commit**

```bash
git add docs/features/cobros-tablero/plan.md docs/features/cobros-tablero/design.md docs/features/cobros-tablero/notes.md
git commit -m "docs(cobros-tablero): plan done"
```

---

## Design coverage

| Design | Task |
|---|---|
| Two lanes, five columns, titles | 1 (`COLUMNS`, `LANES`), 4 |
| No drag and drop; buttons act, page refresh moves the card | 4 (`ItemAction`; actions already call `revalidateBookings`), 6 |
| Cobrado hoy / Devuelto hoy from `confirmed_at` within the club's today, every source | 1 (`clubDayRange`), 2 (`paidToday` query) |
| Rejected transfer leaves Por confirmar, debt stays in Sin cobrar | unchanged data (`reported` only; unpaid logic untouched) |
| Phone: tabs with counts; `md` up: columns side by side, lanes stacked | 4 |
| Card: who, kind + what, when, amount; done adds ✓ and method | 3 |
| Column header: title, count, total; empty dashed line | 4 (`ColumnView`) |
| Sorting: pending oldest first, done latest first | 1 |
| Board-level search + kind filter across columns | 1 (`filterBoard`), 4 |
| `TransferReviewCard` and the sheet reused | 4, 5 |
| `MoneyTable`, `TransfersTable`, summary tiles removed | 5 |
| E2E: cash to Cobrado hoy, transfer confirmed moves; existing selectors updated | 6 |

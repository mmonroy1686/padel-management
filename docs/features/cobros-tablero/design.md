---
feature: cobros-tablero
type: design
status: approved
date: 2026-11-23
branch: feat/cobros-tablero
---

# cobros-tablero — design

## Purpose

Cobros today is three stacked lists (transfers to confirm, played without paying, payments to give back). Reception
reads them top to bottom and loses sight of what already got done. As a board, each payment sits in the column of its
state and moves right when someone acts on it, so the day's flow — what is owed, what is waiting, what came in — is
visible at a glance, and "Cobrado hoy" doubles as the cash closure.

## Decisions (agreed with the user)

- **Columns: pending + done today.** Two lanes:
  - **Cobrar:** `Sin cobrar` → `Por confirmar` → `Cobrado hoy`
  - **Devolver:** `A devolver` → `Devuelto hoy`
- **No drag and drop.** Moving a payment has consequences (checking a receipt, taking cash). Each card keeps its
  buttons; after the action the page refreshes and the card shows up in the next column.
- **Approach A — server-rendered board.** Same server actions, same data loader plus one query; no client state or
  optimistic moves. An animation (view transition) can come later without reworking anything.
- **Phone:** the two lanes become two tabs (`Cobrar`, `Devolver`), each with its count; inside a lane the columns stack
  with their own header. From `md` up, the lane's columns sit side by side and both lanes show, one under the other.

## Columns

| column | what is in it | card action | source |
|---|---|---|---|
| Sin cobrar | played in the last 30 days, still owed (bookings, match shares, tournaments, day use, championships) | `Cobrar en efectivo` (only when the club takes cash) | `unpaid*` (today) |
| Por confirmar | transfers reported by players | `Revisar` → sheet with receipt, `Confirmar` / `Rechazar` | `transfers` (today) |
| Cobrado hoy | payments with `status = confirmed` and `confirmed_at` within the club's today | none; shows method (Efectivo / Transferencia) | **new** |
| A devolver | money taken for something cancelled, or for a player who left a match | `Marcar devuelto` | `refunds` (today) |
| Devuelto hoy | payments with `status = refunded` and `confirmed_at` within the club's today | none | **new** |

- A rejected transfer simply leaves `Por confirmar`; the debt it was for is still in `Sin cobrar` (as today).
- "Cobrado hoy" counts every payment confirmed today, wherever it was taken (Cobros, the grid, a tournament screen):
  that is the till for the day. `confirmed_at` is set by every confirming RPC, so no migration is needed.
- **Known limit (review):** a refund overwrites `confirmed_at` and the status becomes `refunded`, so a payment taken and given back the same day leaves `Cobrado hoy` and only shows in `Devuelto hoy` (Cobrado − Devuelto undercounts the till by that amount). Fixing it needs a `refunded_at` column; left for later. The done columns show their cash part (`En efectivo`) apart from transfers. A `(club_id, confirmed_at)` index can come when payment history grows.
- "Today" is the club's local day (`club.timezone`), from local midnight to the next.

## Card

One card shape for every column: who (bold), what (kind label + court / tournament / product), when, amount (display
font, tabular). Done cards add a ✓ and the method, with muted styling. Column header: title, count and total; an empty
column shows a short dashed "nothing here" line, not a blank.

Sorting inside a column: pending by date ascending (oldest debt first); done by `confirmed_at` descending (latest
first). The current table's search and kind filter move to one board-level search box + kind filter that apply to
every column.

## Units

- `lib/domain/payments-board.ts` (pure): turns the overview + the done-today payments into the five columns (cards,
  count, total, sorting, search/kind filtering helpers). Fully unit tested.
- `lib/data/payments.ts`: `loadPaymentsOverview` also returns `doneToday: { confirmed, refunded }`, read with the same
  select as the reported transfers (factored into one constant) plus `method` and `confirmed_at`, filtered to the
  club's today.
- `app/(club)/club/cobros/`: `payments-board.tsx` (client: lanes, tabs on phone, search/filter), `board-card.tsx`. The
  page builds the cards (it owns `when` formatting and the cash rule) and passes the actions. `TransferReviewCard` and
  the sheet are reused. `MoneyTable`, `TransfersTable` and the summary tiles go away once the board replaces them.

## Testing

- Unit: payments-board domain (columns, totals, today boundary in the club's timezone, sorting, filters); board
  component (columns render, tabs on phone, actions wired, empty columns); card.
- E2E: one Cobros flow — a reception user charges cash on a `Sin cobrar` card and sees it in `Cobrado hoy`; confirms a
  reported transfer and sees it move. Existing e2e that touch Cobros get their selectors updated.

## Out of scope

- Drag and drop, optimistic moves, live updates (Realtime) on the board.
- Choosing a range other than today for the done columns.

## v2 — after trying it (2026-11-23)

Feedback: the pending values read poorly, `Devolver` is lost under a long `Sin cobrar`, and a rejected transfer
vanishes. Agreed changes:

- **Summary strip on top, every screen size:** Sin cobrar, Por confirmar, Cobrado hoy (with its cash part), A devolver:
  big total + count. A tile switches to its lane and scrolls to its column.
- **Lanes are toggles on every screen size** (`Cobrar` / `Devolver`, with what is left to do), so `Devolver` is one tap
  away however long `Sin cobrar` is. Inside a lane, columns side by side from `lg`.
- **Compact rows instead of cards:** line 1 name, amount and a short button (`Cobrar`, `Revisar`, `Devolver`); line 2
  kind · what · when, small. Amounts right-aligned, tabular.
- **New column `Rechazado hoy`** (lane Cobrar, after Cobrado hoy): payments `rejected` with `confirmed_at` today, with
  the reason and the time. Every reject path (staff or automatic, e.g. "Reserva cancelada") sets both; no migration.

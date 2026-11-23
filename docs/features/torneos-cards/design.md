---
feature: torneos-cards
type: design
status: approved
date: 2026-11-23
branch: feat/torneos-cards
---

# torneos-cards — design

## Purpose

`/club/torneos` lists championships and americanos in two tables. They read poorly: every event looks alike, and
reception has to scan the Estado column to find what is live or what needs a step. As cards grouped by stage, with the
active ones first, the page answers at a glance "what is being played, what is taking players, what needs me".

## Decisions (agreed with the user)

- **Both lists** (Campeonatos and Americanos) become cards; same look in both. The tables inside a championship
  (pairs, fixture) are out of scope.
- **Grouped by stage, active first.** Terminated and cancelled ones are folded at the end.

| Campeonatos group | statuses | Americanos group | statuses |
|---|---|---|---|
| En juego | in_progress | En juego | in_progress |
| Inscripción abierta | registration | Inscripción abierta | registration |
| Armando el fixture | closed, drawn, published | Inscripción cerrada | closed |
| Borradores | draft | | |
| Terminados y cancelados (folded) | finished, cancelled | Terminados y cancelados (folded) | finished, cancelled |

- Empty groups are not shown. With no events at all, the current empty text stays.
- Order inside a group: by start date, soonest first; in the folded group, latest first.

## Card

The whole card is one link to the event (`Gestionar <name>` as its accessible name): name (display font), a status
badge (it matters inside "Armando el fixture", where three statuses share the group), when, who is in ("17 parejas ·
2 en espera", "6 de 8 jugadores"). Championships add the next step, from their status:

| status | next step line |
|---|---|
| draft | Siguiente: abrir la inscripción |
| registration | Siguiente: cerrar la inscripción |
| closed | Siguiente: sortear |
| drawn | Siguiente: programar y publicar el fixture |
| published | Fixture publicado |

Grid: one column on a phone, two from `md`, three from `xl`. Group header: a dot in the group's tone, title and
count.

## Units

- `lib/domain/event-groups.ts` (pure): group definitions for championships and americanos, `groupEvents(rows, groups)`
  (filter, order, drop empty groups), `championshipNextStep(status)`. Unit tested.
- `components/club/events-board.tsx`: renders the groups (`<details>` for the folded one) and `EventCard`. Replaces
  `components/club/events-table.tsx`, which is deleted (its only user is this page).
- `app/(club)/club/torneos/page.tsx`: builds the rows as today and passes them to the board.

## Lost on purpose

The table's search, status filter and sorting go: a club has a handful of events at a time, and the grouping is the
filter. If the list grows (years of finished events), the folded group can get its own search later.

## Testing

Unit: grouping and order, empty groups dropped, folded group, next step per status; the board renders groups, cards as
links, the folded group closed. E2E: existing specs that open a championship or americano from `/club/torneos` keep
working (the link keeps the accessible name `Gestionar <name>`).

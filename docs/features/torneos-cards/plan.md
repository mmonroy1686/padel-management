---
feature: torneos-cards
type: plan
status: done
date: 2026-11-23
branch: feat/torneos-cards
references: ./design.md
---

# torneos-cards — implementation plan

## Build sequence

| # | step | output | testable how |
|---|---|---|---|
| 1 | Domain: `lib/domain/event-groups.ts` — `EventRow`, `CHAMPIONSHIP_GROUPS`, `TOURNAMENT_GROUPS`, `groupEvents`, `championshipNextStep` | pure module | `tests/unit/lib/domain/event-groups.test.ts` (red → green) |
| 2 | UI: `components/club/events-board.tsx` — groups (folded one in `<details>`), `EventCard` as a link `Gestionar <name>` | component | `tests/unit/components/club/events-board.test.tsx` |
| 3 | Page: `/club/torneos` renders the boards, `nextStep` on championships; delete `events-table.tsx` (+ test if any) | wiring | typecheck, lint, full Vitest |
| 4 | Look at it (phone + desktop screenshots), commit, push | — | screenshots |

## Acceptance criteria

- [ ] Championships and americanos show as cards, grouped by stage, active first, empty groups hidden.
- [ ] Terminados y cancelados folded at the end.
- [ ] Championship cards show the next step for draft → published.
- [ ] Whole card links to the event; accessible name `Gestionar <name>`.

## Plan revisions

- **v1 (2026-11-23)**: initial plan.

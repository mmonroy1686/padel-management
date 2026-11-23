---
feature: campeonato-publico
type: design
status: approved
date: 2026-11-23
branch: feat/campeonato-publico
---

# campeonato-publico — design

## Purpose

The championship's public page (`/c/<código>`) reads like a staff tool: scoreboards with badges, a bracket as loose
columns, and a "Modo TV" button anyone with the link can open. Players and their families want what sports apps show:
each match as a clean card (when, where, who, the sets) grouped by round, and a real draw with lines joining the rounds.
The TV mode is the club's screen, so only the club's staff opens it.

## Decisions (agreed with the user)

- **TV mode is staff only** (admin and reception). `/c/<código>/tv` asks for a staff session of the championship's
  club; the "Modo TV" button leaves the public page (the club panel already links it).
- **Scope:** the public page and the player's "Mis partidos". The club panel (fixture table, live scoring, TV) keeps
  `MatchLine` as it is.
- **Each match card has a share button**: the phone's share sheet with the result (or when and where, before it is
  played) and the championship's link.
- **Matches grouped by round/phase**, not by day: "Zona A", "Zona B", then "Cuartos de final", "Semifinal", "Final".

## Match card (first reference image)

```
┌ 📅 sáb 10/10 09:00   📍 Cancha 1            [En juego] ┐
│ (GL) García / López                    6  6  │   ↗     │
│ (MP) Moreno / Prieto                   4  3  │         │
└──────────────────────────────────────────────┴─────────┘
```

- Top strip, muted: day and time, court; a pill on the right for a match in play (pulsing) or a walkover.
- One row per pair: initials avatar (pastel tone picked from the name, so a pair keeps its color), names, one digit
  per set. The winner's name bold and its digits in the club's accent; the loser's in muted gray. A set being played
  shows with a ring. Unknown pairs ("Ganador Cuartos 1") in italics.
- Right column, divided: the share button (icon, accessible name `Compartir <A> contra <B>`).
- Card name for screen readers stays `<A> contra <B>`.

## Draw (second reference image)

- One column per round, header "Cuartos de final (4 partidos)". Each match a compact box: two rows (name, set cells:
  winner's cells filled in the accent), under it day · time · court in small accent text.
- Lines join each pair of matches to the one they feed in the next round (CSS borders, no SVG): each column splits its
  height evenly, so a match sits centered between its two feeders.
- Wide screens show the whole draw; on a phone it scrolls sideways with snap, one or two rounds in view.
- A category without knockout has no draw section. Consolation draws don't exist in the app; no tabs for them.

## Public page layout

Category tabs as today; inside: "En juego ahora" (cards), Zonas (tables as today), Cuadro (the draw), Partidos
(cards grouped by phase). Header keeps the name, dates, Compartir and Buscar jugador; no Modo TV.

## Player: Mis partidos

Each of the viewer's matches as the same card, with a line on top naming championship · category · round, and the card
linking to the championship as today (the share button stays out: the whole card is a link).

## Units

- `lib/domain/championship-cards.ts` (pure): `pairInitials`, `avatarTone`, `phaseGroups(views)` (zones first in name
  order, then knockout rounds from the first to the final; by start inside), `matchShareText(match, championship,
  url)`.
- `components/championships/match-card.tsx`: the card (props: match, share data or none, optional top line, href).
- `components/championships/bracket-tree.tsx`: the draw with connectors.
- `app/c/[code]/public-board.tsx`: uses them; `tvHref` goes.
- `app/c/[code]/tv/page.tsx`: `requireStaff`, and the code must be one of the staff club's championships (else 404).
- `components/championships/my-matches.tsx`: renders `MatchCard`.

## Testing

Unit: initials, tone stability, phase grouping and order, share text (played / not played / walkover); card (winner
marked by weight and not only color, share name, strip, live pill); bracket (round headers with counts, matches in
order, connectors present); public board without Modo TV. TV: page redirects without session (e2e if a spec covers
it; else unit of the access check). Screenshots phone + desktop.

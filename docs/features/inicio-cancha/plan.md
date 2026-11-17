---
feature: inicio-cancha
type: plan
status: done
date: 2026-11-17
branch: feat/inicio-cancha
references: ./design.md
---

# Inicio cancha Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `/team-setup:execute` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El Inicio del club (`/club/inicio`) muestra cada turno como una cancha de pádel con sus 4 jugadores y su cobro adentro, sigue mostrando por 30 minutos las canchas que terminaron y deben, abre los pendientes viejos a la misma cancha, pone las transferencias por confirmar en una tarjeta arriba de todo y reemplaza "Lo que pasa hoy" por "El día" (ocupación y horarios libres, avisos y cancelaciones de hoy).

**Architecture:** Sin cambios en la base. La lógica nueva es pura en `lib/domain/club-home.ts` (secciones con `recent`, `turnLabel`, `alerts`, `cancellationsToday`, `freeSlotsAhead`, `dayOccupancy`, `transfersCard`), testeada con Vitest. `lib/data/club-home.ts` suma en paralelo la grilla del día (`loadDayGrid`), las reservas canceladas de hoy (mismo select que Cobros) y el `created_at` de las transferencias. `BookingPlayers` gana `layout: 'list' | 'court'`: la Grilla sigue con `list`; el Inicio usa `court`, que dibuja `TurnCourt`. Tres componentes nuevos: `PendingList`, `TransfersCard` y `HomeDay`.

**Tech Stack:** Next.js 16.3 (App Router, Server Components, Server Actions), React 19, TypeScript, Tailwind 4, Supabase, Vitest + Testing Library, Playwright.

---

## Antes de empezar

- Rama: `feat/inicio-cancha` (sale de `main` en `5ffab3d`). Se ejecuta de corrido, sin pedir confirmación entre tasks. Cada task termina en verde y en un commit.
- **El árbol tiene cambios que no son de esta feature** (`scripts/demo-data.mjs`, `supabase/config.toml`): no se tocan ni se agregan. Siempre `git add` con las rutas exactas de cada task, nunca `git add -A` ni `git add .`.
- **Este plan se validó antes de escribirse**: el código de las Tasks 1 a 7, aplicado entero en un worktree aparte, pasó Vitest completo (188 archivos, 1046 tests), `npm run typecheck` y `npm run lint`. El e2e de la Task 8 se escribió, se tipó y pasó el lint, pero no se corrió (el worktree no podía levantar `next dev`): se corre en la Task 8.
- Next 16: el plan no usa APIs nuevas de Next. Solo `Link`, Server Components y un componente cliente con `useState`. Antes de tocar código, leer `node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md` y `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`.
- Windows: las rutas con paréntesis (`app/(club)/…`) van entre comillas en bash. Los archivos se escriben con las herramientas Write/Edit, no con heredoc.
- Checks de cada task: `npx vitest run <archivos>`, `npm run typecheck`, `npm run lint`.
- UI en español rioplatense; comentarios del código en inglés.

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `lib/domain/club-home.ts` (modificar) | Secciones con `recent`, `turnLabel`, `chargeLabel`, `occupancyKind` de los eventos, `alerts`, `cancellationsToday`, `freeSlotsAhead`, `dayOccupancy`, `occupancyLine`, `transfersCard`. Salen `todayLines` y `transfersLine`. |
| `components/club/turn-court.tsx` (nuevo) | La cancha con los 4 lugares; un lugar con deuda es un botón "Cobrar $300". |
| `components/club/booking-players.tsx` (modificar) | `layout: 'list' \| 'court'`. Misma lógica de cobro, hoja y avisos. |
| `components/club/court-card.tsx` (modificar) | Cada turno como cancha, con "Faltan / Empieza / Terminó hace"; eventos como tarjeta angosta con ícono. `now` pasa a ser obligatorio. |
| `components/ui/icon.tsx` (modificar) | Íconos `transfer`, `alert`, `cancel`. |
| `components/club/pending-list.tsx` (nuevo) | Filas compactas de "Pendientes de cobro" que se abren a la cancha. |
| `components/club/transfers-card.tsx` (nuevo) | La tarjeta de transferencias por confirmar. |
| `components/club/home-day.tsx` (nuevo) | Las tres tarjetas de "El día". |
| `lib/data/payments.ts` (modificar) | Exporta `BOOKING_SELECT`. |
| `lib/data/club-home.ts` (modificar) | Lee grilla, canceladas y `created_at`; devuelve `alerts`, `transfers`, `occupancy`, `cancellations`. |
| `app/(club)/club/inicio/page.tsx` (modificar) | Arma la pantalla nueva. |
| `tests/e2e/support/club-home.ts`, `tests/e2e/club-home.spec.ts` (modificar) | Cobro desde la cancha y la cancha recién terminada que desaparece al pagar. |

---

### Task 0: Commit del diseño y del plan

**Files:**
- Add: `docs/features/inicio-cancha/design.md`, `docs/features/inicio-cancha/plan.md`

- [ ] **Step 1: Commit**

```bash
git add docs/features/inicio-cancha/design.md docs/features/inicio-cancha/plan.md
git commit -m "docs(inicio-cancha): design and plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: Dominio, las secciones con "recientes" y el encabezado de cada cancha

**Files:**
- Modify: `lib/domain/club-home.ts`
- Test: `tests/unit/lib/domain/club-home.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

En `tests/unit/lib/domain/club-home.test.ts`, reemplazar:

```ts
import {
  competitionsToday,
  courtItems,
  homeSections,
  playerLabel,
  timeLeft,
  todayLines,
  transfersLine,
  turnPlayers,
  type HomePayment,
  type TurnBookingRow,
} from '@/lib/domain/club-home'
import { at, COURTS, occupancy } from '../../fixtures/grid'
```

con:

```ts
import {
  chargeLabel,
  competitionsToday,
  courtItems,
  homeSections,
  playerLabel,
  timeLeft,
  todayLines,
  transfersLine,
  turnLabel,
  turnPlayers,
  type HomePayment,
  type TurnBookingRow,
} from '@/lib/domain/club-home'
import { at, COURTS, occupancy, TIMEZONE } from '../../fixtures/grid'
```

En el mismo archivo, reemplazar:

```ts
    expect(turn).toMatchObject({ isMatch: false, restDue: 1202, missingNames: true })
    expect(playerLabel(turn.players[2])).toBe('Jugador 3')
  })
```

con:

```ts
    expect(turn).toMatchObject({ isMatch: false, restDue: 1202, missingNames: true })
    expect(playerLabel(turn.players[2])).toBe('Jugador 3')
    expect(chargeLabel(turn.players[0])).toBe('Cobrar $302 a Ana')
    expect(chargeLabel(turn.players[2])).toBe('Cobrar $300 a Jugador 3')
  })
```

Reemplazar:

```ts
    expect(items.find((item) => item.id === 'o-class')).toMatchObject({
      kind: 'event',
      courtName: 'Cancha 2',
```

con:

```ts
    expect(items.find((item) => item.id === 'o-class')).toMatchObject({
      kind: 'event',
      occupancyKind: 'block',
      courtName: 'Cancha 2',
```

Reemplazar:

```ts
  it('a booking is in play from the minute it starts, and pending from the minute it ends', () => {
    const sections = homeSections(items, at('11:00'))
    expect(ids(sections.playing)).toEqual(['o-now', 'o-class'])
    expect(ids(sections.pending)).toEqual(['o-early', 'o-ended'])
  })
```

con:

```ts
  it('a booking is in play from the minute it starts, and recent from the minute it ends', () => {
    const sections = homeSections(items, at('11:00'))
    expect(ids(sections.playing)).toEqual(['o-now', 'o-class'])
    expect(ids(sections.recent)).toEqual(['o-ended'])
    expect(ids(sections.pending)).toEqual(['o-early'])
  })

  it('a booking that owes stays recent up to 30 minutes after it ends, then goes to pending', () => {
    expect(ids(homeSections(items, at('11:30')).recent)).toEqual(['o-ended'])
    const later = homeSections(items, at('11:31'))
    expect(later.recent).toEqual([])
    expect(ids(later.pending)).toEqual(['o-early', 'o-ended'])
  })

  it('a paid booking is neither recent nor pending', () => {
    const sections = homeSections(items, at('09:30'))
    expect(ids(sections.recent)).toEqual(['o-early'])
    expect(sections.pending).toEqual([])
  })
```

Reemplazar:

```ts
describe('Lo que pasa hoy', () => {
```

con:

```ts
describe('turnLabel', () => {
  const slot = { startsAt: at('11:00'), endsAt: at('12:30') }

  it('says when it starts, what is left or how long ago it ended', () => {
    expect(turnLabel(slot, at('10:15'), TIMEZONE)).toBe('Empieza 11:00')
    expect(turnLabel(slot, at('11:56'), TIMEZONE)).toBe('Faltan 34 min')
    expect(turnLabel(slot, at('12:30'), TIMEZONE)).toBe('Terminó recién')
    expect(turnLabel(slot, at('12:42'), TIMEZONE)).toBe('Terminó hace 12 min')
  })
})

describe('Lo que pasa hoy', () => {
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `npx vitest run tests/unit/lib/domain/club-home.test.ts`
Expected: FAIL (`chargeLabel is not a function`, `turnLabel is not a function`, `sections.recent` undefined).

- [ ] **Step 3: Implementar**

En `lib/domain/club-home.ts`, reemplazar:

```ts
import { formatPrice } from './format'
```

con:

```ts
import { formatPrice, timeIn } from './format'
```

Reemplazar:

```ts
  startsAt: Date
  endsAt: Date
  label: string
  href: string | null
}
```

con:

```ts
  startsAt: Date
  endsAt: Date
  // What holds the court: the card's icon.
  occupancyKind: Occupancy['kind']
  label: string
  href: string | null
}
```

Reemplazar:

```ts
export type HomeSections = { playing: CourtItem[]; upcoming: CourtItem[]; pending: CourtTurn[]; next: CourtItem | null }
```

con:

```ts
export type HomeSections = {
  playing: CourtItem[]
  // Ended within RECENT_MINUTES and still owe something: they stay in "En cancha ahora".
  recent: CourtTurn[]
  upcoming: CourtItem[]
  pending: CourtTurn[]
  next: CourtItem | null
}
```

Reemplazar:

```ts
export const UPCOMING_MINUTES = 90
```

con:

```ts
export const UPCOMING_MINUTES = 90
// A court that ended this long ago and still owes stays in "En cancha ahora".
export const RECENT_MINUTES = 30
```

Reemplazar:

```ts
export function playerLabel(player: Pick<PlayerShare, 'position' | 'name'>): string {
  return player.name ?? `Jugador ${player.position}`
}
```

con:

```ts
export function playerLabel(player: Pick<PlayerShare, 'position' | 'name'>): string {
  return player.name ?? `Jugador ${player.position}`
}

// The name of the button that charges one share, and of its confirmation: "Cobrar $300 a Bruno".
export function chargeLabel(player: Pick<PlayerShare, 'position' | 'name' | 'due'>): string {
  return `Cobrar ${formatPrice(player.due)} a ${playerLabel(player)}`
}
```

Reemplazar:

```ts
      return [{ ...base, kind: 'event', label: occupancy.note ?? KIND_LABELS[occupancy.kind], href: eventHref(occupancy) }]
```

con:

```ts
      return [
        {
          ...base,
          kind: 'event',
          occupancyKind: occupancy.kind,
          label: occupancy.note ?? KIND_LABELS[occupancy.kind],
          href: eventHref(occupancy),
        },
      ]
```

Reemplazar:

```ts
// En cancha ahora: started (at `now` included) and not ended. Próximos: starts within 90 minutes. Pendientes de
// cobro: a booking that ended (at `now` included) and still owes something.
export function homeSections(items: CourtItem[], now: Date): HomeSections {
  const time = now.getTime()
  const horizon = time + UPCOMING_MINUTES * 60_000
  return {
    playing: items.filter((item) => item.startsAt.getTime() <= time && time < item.endsAt.getTime()),
    upcoming: items.filter((item) => item.startsAt.getTime() > time && item.startsAt.getTime() <= horizon),
    pending: items.filter(
      (item): item is CourtTurn => item.kind === 'turn' && item.endsAt.getTime() <= time && item.restDue > 0,
    ),
    next: items.find((item) => item.startsAt.getTime() > time) ?? null,
  }
}
```

con:

```ts
// En cancha ahora: started (at `now` included) and not ended. Recientes: a booking that ended (at `now` included)
// up to 30 minutes ago and still owes something. Próximos: starts within 90 minutes. Pendientes de cobro: a booking
// that ended before that and still owes something.
export function homeSections(items: CourtItem[], now: Date): HomeSections {
  const time = now.getTime()
  const horizon = time + UPCOMING_MINUTES * 60_000
  const recentFrom = time - RECENT_MINUTES * 60_000
  const owing = items.filter(
    (item): item is CourtTurn => item.kind === 'turn' && item.endsAt.getTime() <= time && item.restDue > 0,
  )
  return {
    playing: items.filter((item) => item.startsAt.getTime() <= time && time < item.endsAt.getTime()),
    recent: owing.filter((item) => item.endsAt.getTime() >= recentFrom),
    upcoming: items.filter((item) => item.startsAt.getTime() > time && item.startsAt.getTime() <= horizon),
    pending: owing.filter((item) => item.endsAt.getTime() < recentFrom),
    next: items.find((item) => item.startsAt.getTime() > time) ?? null,
  }
}
```

Reemplazar:

```ts
// The tournaments and championships that hold a court today, once each.
```

con:

```ts
// The header of a court: "Empieza 14:30", "Faltan 34 min" or "Terminó hace 12 min".
export function turnLabel(item: { startsAt: Date; endsAt: Date }, now: Date, timezone: string): string {
  const time = now.getTime()
  if (item.startsAt.getTime() > time) return `Empieza ${timeIn(item.startsAt, timezone)}`
  if (time < item.endsAt.getTime()) return timeLeft(item, now).text
  const minutes = Math.floor((time - item.endsAt.getTime()) / 60_000)
  return minutes === 0 ? 'Terminó recién' : `Terminó hace ${minutes} min`
}

// The tournaments and championships that hold a court today, once each.
```

- [ ] **Step 4: Correr los tests y ver que pasan**

Run: `npx vitest run tests/unit/lib/domain/club-home.test.ts tests/unit/components/club`
Expected: PASS.

Run: `npm run typecheck` y `npm run lint`
Expected: sin errores. (La página sigue igual: los recientes todavía no se muestran; la Task 7 los suma.)

- [ ] **Step 5: Commit**

```bash
git add lib/domain/club-home.ts tests/unit/lib/domain/club-home.test.ts
git commit -m "feat(inicio): recent courts, turnLabel and chargeLabel in the club home domain

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Dominio de "El día" y de la tarjeta de transferencias

**Files:**
- Modify: `lib/domain/club-home.ts`
- Test: `tests/unit/lib/domain/club-home.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

En `tests/unit/lib/domain/club-home.test.ts`, reemplazar:

```ts
import {
  chargeLabel,
  competitionsToday,
  courtItems,
  homeSections,
  playerLabel,
  timeLeft,
  todayLines,
  transfersLine,
  turnLabel,
  turnPlayers,
  type HomePayment,
  type TurnBookingRow,
} from '@/lib/domain/club-home'
import { at, COURTS, occupancy, TIMEZONE } from '../../fixtures/grid'
```

con:

```ts
import {
  alerts,
  cancellationsToday,
  chargeLabel,
  competitionsToday,
  courtItems,
  dayOccupancy,
  freeSlotsAhead,
  homeSections,
  occupancyLine,
  playerLabel,
  timeLeft,
  todayLines,
  transfersCard,
  transfersLine,
  turnLabel,
  turnPlayers,
  type HomePayment,
  type TurnBookingRow,
} from '@/lib/domain/club-home'
import type { OverviewBooking } from '@/lib/domain/payments-overview'
import { at, COURTS, makeGrid, occupancy, TIMEZONE } from '../../fixtures/grid'
```

Al final del mismo archivo, después del `describe('transfersLine', …)`, agregar:

```ts

describe('alerts', () => {
  const spots = (...players: (string | null)[]) => ({
    slots: players.map((playerId, index) => ({
      position: index + 1,
      side: index % 2 === 0 ? ('drive' as const) : ('backhand' as const),
      playerId,
      playerName: playerId,
    })),
  })

  it('writes what asks for something, with its number and link, and how many players the matches miss', () => {
    expect(
      alerts({
        forming: [spots('ana', null, null, 'bruno'), spots('hugo', 'pepe', 'lucho', null)],
        competitions: [
          { kind: 'tournament', id: 't1', name: 'Copa de la Casa' },
          { kind: 'championship', id: 'c1', name: 'Apertura' },
        ],
        inside: 8,
        waiting: 3,
      }),
    ).toEqual([
      { kind: 'forming', count: 2, href: '/club/grilla', text: '2 partidos armándose · faltan 3 jugadores' },
      { kind: 'waiting', count: 3, href: '/club/grilla', text: '3 esperando turno hoy' },
      { kind: 'tournament', count: null, href: '/club/torneos/t1', text: 'Torneo Copa de la Casa en juego' },
      {
        kind: 'championship',
        count: null,
        href: '/club/torneos/campeonatos/c1',
        text: 'Campeonato Apertura en juego',
      },
      { kind: 'day_use', count: 8, href: '/club/day-use', text: '8 en el club (day use)' },
    ])
  })

  it('says one match and one player in singular, and leaves out what does not happen', () => {
    expect(alerts({ forming: [spots('ana', 'bruno', 'hugo', null)], competitions: [], inside: 0, waiting: 0 })).toEqual([
      { kind: 'forming', count: 1, href: '/club/grilla', text: '1 partido armándose · falta 1 jugador' },
    ])
    expect(alerts({ forming: [], competitions: [], inside: 0, waiting: 0 })).toEqual([])
  })
})

describe('cancellationsToday', () => {
  function cancelled(overrides: Partial<OverviewBooking> = {}): OverviewBooking {
    return {
      id: 'b1',
      starts_at: '2026-10-01T21:30:00+00:00',
      price: 1600,
      status: 'cancelled',
      guest_name: null,
      court: { name: 'Cancha 2' },
      player: { display_name: 'Martina' },
      payments: [],
      ...overrides,
    }
  }

  it('lists the cancelled bookings in time order, with the confirmed money to give back', () => {
    expect(
      cancellationsToday([
        cancelled({
          id: 'late',
          payments: [
            { id: 'p1', status: 'confirmed', amount: 1000 },
            { id: 'p2', status: 'confirmed', amount: 600 },
            { id: 'p3', status: 'rejected', amount: 1600 },
          ],
        }),
        cancelled({ id: 'early', starts_at: '2026-10-01T12:30:00+00:00', guest_name: 'Rodríguez', court: { name: 'Cancha 1' } }),
      ]),
    ).toEqual([
      { bookingId: 'early', courtName: 'Cancha 1', startsAt: new Date('2026-10-01T12:30:00Z'), holder: 'Rodríguez', refund: 0 },
      { bookingId: 'late', courtName: 'Cancha 2', startsAt: new Date('2026-10-01T21:30:00Z'), holder: 'Martina', refund: 1600 },
    ])
  })

  it('a refunded payment is no longer owed, and an open match has no holder', () => {
    const [match] = cancellationsToday([
      cancelled({ match_id: 'm1', player: null, payments: [{ id: 'p1', status: 'refunded', amount: 400 }] }),
    ])
    expect(match).toMatchObject({ holder: 'Partido abierto', refund: 0 })
  })
})

describe('freeSlotsAhead and dayOccupancy', () => {
  const taken = [occupancy('o1', 'court-1', '17:00', '18:30')]

  it('lists the next free slots after now, in time and court order, up to the limit', () => {
    const grid = makeGrid({ occupancies: taken, now: at('16:00') })
    expect(freeSlotsAhead(grid, at('16:00'), 4).map((slot) => slot.label)).toEqual([
      '17:00 Cancha 2',
      '18:30 Cancha 1',
      '18:30 Cancha 2',
      '20:00 Cancha 1',
    ])
    expect(freeSlotsAhead(grid, at('16:00'), 1)[0]).toEqual({
      courtName: 'Cancha 2',
      startsAt: at('17:00'),
      label: '17:00 Cancha 2',
    })
  })

  it('leaves out the slot that starts now and the ones before it', () => {
    expect(freeSlotsAhead(makeGrid({ now: at('20:00') }), at('20:00'), 4).map((slot) => slot.label)).toEqual([
      '21:30 Cancha 1',
      '21:30 Cancha 2',
    ])
    expect(freeSlotsAhead(makeGrid({ now: at('21:30') }), at('21:30'), 4)).toEqual([])
  })

  it('sums up the day: occupancy, free slots left and the next ones', () => {
    const day = dayOccupancy(makeGrid({ occupancies: taken, now: at('16:00') }), at('16:00'))
    expect(day).toMatchObject({ percent: 5, free: 7 })
    expect(day.slots).toHaveLength(4)
    expect(occupancyLine(day)).toBe('5 % ocupado · 7 turnos libres')
    expect(occupancyLine({ percent: 95, free: 1 })).toBe('95 % ocupado · 1 turno libre')
  })
})

describe('transfersCard', () => {
  const now = new Date('2026-10-01T15:00:00Z')
  const transfer = (amount: number, minutesAgo: number) => ({
    amount,
    created_at: new Date(now.getTime() - minutesAgo * 60_000).toISOString(),
  })

  it('counts the transfers to confirm, their money and how old the oldest is', () => {
    expect(transfersCard([transfer(1200, 20), transfer(1600, 135), transfer(400, 5)], now)).toEqual({
      count: 3,
      total: 3200,
      text: '3 transferencias por confirmar · $3.200',
      age: 'la más vieja hace 2 h',
    })
  })

  it('says the age in minutes, hours or days, and nothing without transfers', () => {
    expect(transfersCard([transfer(1200, 12)], now)).toMatchObject({
      text: '1 transferencia por confirmar · $1.200',
      age: 'hace 12 min',
    })
    expect(transfersCard([transfer(1200, 0)], now)?.age).toBe('hace un momento')
    expect(transfersCard([transfer(1200, 60 * 24)], now)?.age).toBe('hace 1 día')
    expect(transfersCard([transfer(1200, 60 * 50)], now)?.age).toBe('hace 2 días')
    expect(transfersCard([], now)).toBeNull()
  })
})
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `npx vitest run tests/unit/lib/domain/club-home.test.ts`
Expected: FAIL (`alerts is not a function`, etc.).

- [ ] **Step 3: Implementar**

En `lib/domain/club-home.ts`, reemplazar:

```ts
import { formatPrice, timeIn } from './format'
import { holderName, KIND_LABELS, type Occupancy } from './grid'
import { shareFor, type SlotHolder } from './match-payments'
import type { PaymentStatus } from './payments'

// The club's Inicio: what is being played now, what comes next, what was played today and is still owed, and
// each player's share of a booking. Same rules as charge_booking_share and charge_booking_rest.
```

con:

```ts
import { formatPrice, timeIn } from './format'
import { countFree, dayStats, holderName, KIND_LABELS, type DayGrid, type Occupancy } from './grid'
import { shareFor, type SlotHolder } from './match-payments'
import { openSlots, type Match } from './matches'
import type { PaymentStatus } from './payments'
import { holderLabel, refundsDue, type OverviewBooking } from './payments-overview'
import { toDate } from './time'

// The club's Inicio: what is being played now, what comes next, what was played today and is still owed, each
// player's share of a booking, and the day (occupancy, alerts, cancellations). Same rules as charge_booking_share
// and charge_booking_rest.
```

Reemplazar:

```ts
export type Competition = { kind: 'tournament' | 'championship'; id: string; name: string }
export type TodayLine = { text: string; href: string }
```

con:

```ts
export type Competition = { kind: 'tournament' | 'championship'; id: string; name: string }
export type TodayLine = { text: string; href: string }
export type AlertKind = 'forming' | 'waiting' | 'tournament' | 'championship' | 'day_use'
// count: the number the card shows big; null for a competition (its name says it).
export type HomeAlert = { kind: AlertKind; text: string; href: string; count: number | null }
export type Cancellation = { bookingId: string; courtName: string; startsAt: Date; holder: string; refund: number }
export type FreeSlot = { courtName: string; startsAt: Date; label: string }
export type DayOccupancy = { percent: number; free: number; slots: FreeSlot[] }
export type ReportedTransfer = { amount: number; created_at: string }
export type TransfersSummary = { count: number; total: number; text: string; age: string }
```

Reemplazar:

```ts
export const RECENT_MINUTES = 30
```

con:

```ts
export const RECENT_MINUTES = 30
// "El día": how many free slots the Ocupación card lists.
export const FREE_SLOTS_SHOWN = 4
```

Reemplazar:

```ts
// "3 transferencias por confirmar · $4.800", or nothing.
export function transfersLine(totals: { count: number; total: number }): string | null {
  if (totals.count === 0) return null
  return `${plural(totals.count, 'transferencia por confirmar', 'transferencias por confirmar')} · ${formatPrice(totals.total)}`
}
```

con:

```ts
// "3 transferencias por confirmar · $4.800", or nothing.
export function transfersLine(totals: { count: number; total: number }): string | null {
  if (totals.count === 0) return null
  return `${plural(totals.count, 'transferencia por confirmar', 'transferencias por confirmar')} · ${formatPrice(totals.total)}`
}

// Avisos: only what asks for something, each with its link; nothing for what does not happen.
export function alerts(input: {
  forming: Pick<Match, 'slots'>[]
  competitions: Competition[]
  inside: number
  waiting: number
}): HomeAlert[] {
  const list: HomeAlert[] = []
  if (input.forming.length > 0) {
    const missing = input.forming.reduce((sum, match) => sum + openSlots(match).length, 0)
    const matches = plural(input.forming.length, 'partido armándose', 'partidos armándose')
    const players = `${missing === 1 ? 'falta' : 'faltan'} ${plural(missing, 'jugador', 'jugadores')}`
    list.push({
      kind: 'forming',
      count: input.forming.length,
      href: '/club/grilla',
      text: missing > 0 ? `${matches} · ${players}` : matches,
    })
  }
  if (input.waiting > 0) {
    list.push({ kind: 'waiting', count: input.waiting, href: '/club/grilla', text: `${input.waiting} esperando turno hoy` })
  }
  for (const competition of input.competitions) {
    list.push(
      competition.kind === 'tournament'
        ? {
            kind: 'tournament',
            count: null,
            href: `/club/torneos/${competition.id}`,
            text: `Torneo ${competition.name} en juego`,
          }
        : {
            kind: 'championship',
            count: null,
            href: `/club/torneos/campeonatos/${competition.id}`,
            text: `Campeonato ${competition.name} en juego`,
          },
    )
  }
  if (input.inside > 0) {
    list.push({ kind: 'day_use', count: input.inside, href: '/club/day-use', text: `${input.inside} en el club (day use)` })
  }
  return list
}

// Today's cancelled bookings, in time order, with what the club has to give back: its confirmed payments, the same
// rule as Cobros (refundsDue).
export function cancellationsToday(rows: OverviewBooking[]): Cancellation[] {
  return rows
    .map((row) => ({
      bookingId: row.id,
      courtName: row.court?.name ?? 'Cancha',
      startsAt: toDate(row.starts_at),
      holder: row.match_id && !row.guest_name && !row.player ? 'Partido abierto' : holderLabel(row),
      refund: refundsDue([row]).reduce((sum, item) => sum + item.amount, 0),
    }))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
}

// The next free slots of the day after `now`, in time order and, at the same time, in the club's court order.
export function freeSlotsAhead(grid: Pick<DayGrid, 'rows'>, now: Date, limit: number): FreeSlot[] {
  return grid.rows
    .filter((row) => row.slot.startsAt.getTime() > now.getTime())
    .flatMap((row) =>
      row.cells
        .filter((cell) => cell.state === 'free')
        .map((cell) => ({
          courtName: cell.court.name,
          startsAt: row.slot.startsAt,
          label: `${row.slot.label} ${cell.court.name}`,
        })),
    )
    .slice(0, limit)
}

// Ocupación: the day's occupancy, how many slots are still free and the next ones.
export function dayOccupancy(grid: DayGrid, now: Date): DayOccupancy {
  return {
    percent: dayStats(grid).occupancyPercent,
    free: countFree(grid.rows),
    slots: freeSlotsAhead(grid, now, FREE_SLOTS_SHOWN),
  }
}

// "68 % ocupado · 7 turnos libres".
export function occupancyLine(occupancy: Pick<DayOccupancy, 'percent' | 'free'>): string {
  return `${occupancy.percent} % ocupado · ${plural(occupancy.free, 'turno libre', 'turnos libres')}`
}

function ago(milliseconds: number): string {
  const minutes = Math.max(0, Math.floor(milliseconds / 60_000))
  if (minutes === 0) return 'un momento'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h`
  return plural(Math.floor(hours / 24), 'día', 'días')
}

// The transfers card: "11 transferencias por confirmar · $13.800" and "la más vieja hace 2 h"; null without any.
export function transfersCard(rows: ReportedTransfer[], now: Date): TransfersSummary | null {
  if (rows.length === 0) return null
  const money = rows.reduce((sum, row) => sum + row.amount, 0)
  const since = ago(now.getTime() - Math.min(...rows.map((row) => new Date(row.created_at).getTime())))
  return {
    count: rows.length,
    total: money,
    text: `${plural(rows.length, 'transferencia por confirmar', 'transferencias por confirmar')} · ${formatPrice(money)}`,
    age: rows.length === 1 ? `hace ${since}` : `la más vieja hace ${since}`,
  }
}
```

- [ ] **Step 4: Correr los tests y ver que pasan**

Run: `npx vitest run tests/unit/lib/domain/club-home.test.ts tests/unit/lib/domain/grid.test.ts tests/unit/lib/domain/payments-overview.test.ts`
Expected: PASS.

Run: `npm run typecheck` y `npm run lint`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/club-home.ts tests/unit/lib/domain/club-home.test.ts
git commit -m "feat(inicio): alerts, cancellations, free slots and the transfers card in the domain

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: La cancha con los 4 jugadores (`TurnCourt`) y `BookingPlayers` con `layout`

**Files:**
- Create: `components/club/turn-court.tsx`
- Modify: `components/club/booking-players.tsx`
- Test: `tests/unit/components/club/turn-court.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

Create `tests/unit/components/club/turn-court.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BookingPlayers, type PlayersActions } from '@/components/club/booking-players'
import { TurnCourt } from '@/components/club/turn-court'
import type { FormAction } from '@/components/ui/action-form'
import type { ActionState } from '@/lib/actions/result'
import { turnPlayers, type TurnBookingRow } from '@/lib/domain/club-home'

function turnOf(overrides: Partial<TurnBookingRow> = {}) {
  return turnPlayers({
    id: 'b1',
    price: 1200,
    player_id: 'ana',
    guest_name: null,
    match_id: null,
    player: { display_name: 'Ana Pérez' },
    match: null,
    players: [{ position: 2, player_id: 'bruno', name: null, player: { display_name: 'Bruno' } }],
    payments: [{ status: 'confirmed', amount: 300, payer_id: null, payer_position: 2 }],
    ...overrides,
  })
}

const ok = (message: string) => async (): Promise<ActionState> => ({ status: 'ok', message })

function renderCourt(turn = turnOf()) {
  const actions: PlayersActions = {
    chargeShare: vi.fn<FormAction>(ok('Cobramos $300 en efectivo.')),
    chargeRest: vi.fn<FormAction>(ok('Cobramos $900 por transferencia.')),
    savePlayers: vi.fn<FormAction>(ok('Jugadores guardados.')),
  }
  render(
    <BookingPlayers
      bookingId="b1"
      turn={turn}
      methods={{ cash: true, transfer: true }}
      members={[]}
      actions={actions}
      layout="court"
    />,
  )
  return actions
}

describe('TurnCourt', () => {
  it('draws four spots, each with the name and whether the player paid', () => {
    renderCourt()
    const spots = within(screen.getByRole('list', { name: 'Jugadores' })).getAllByRole('listitem')
    expect(spots.map((spot) => spot.textContent)).toEqual([
      'Ana PérezCobrar $300',
      'BrunoPagó ✓',
      'Jugador 3Cobrar $300',
      'Jugador 4Cobrar $300',
    ])
    expect(screen.getByRole('button', { name: 'Cobrar $300 a Jugador 3' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cobrar todo lo que falta ($900)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Completar jugadores' })).toBeInTheDocument()
  })

  it('opens the confirmation under the court, and charges that share', async () => {
    const actions = renderCourt()
    await userEvent.click(screen.getByRole('button', { name: 'Cobrar $300 a Ana Pérez' }))
    const choice = screen.getByRole('group', { name: 'Cobrar $300 a Ana Pérez' })
    expect(screen.getByRole('list', { name: 'Jugadores' })).not.toContainElement(choice)
    expect(screen.queryByRole('button', { name: 'Cobrar $300 a Ana Pérez' })).not.toBeInTheDocument()
    expect(within(screen.getAllByRole('listitem')[0]).getByText('Debe $300')).toBeInTheDocument()

    await userEvent.click(within(choice).getByRole('button', { name: 'Efectivo' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Cobramos $300 en efectivo.')
    expect(Object.fromEntries(vi.mocked(actions.chargeShare).mock.calls[0][1].entries())).toEqual({
      bookingId: 'b1',
      position: '1',
      method: 'cash',
    })
  })

  it('an open match leaves its empty spots free, and a reported transfer says so', () => {
    const match = turnOf({
      player_id: null,
      player: null,
      match_id: 'm1',
      players: [],
      match: {
        slots: [
          { position: 1, player_id: 'ana', player: { display_name: 'Ana' } },
          { position: 3, player_id: 'hugo', player: { display_name: 'Hugo' } },
        ],
      },
      payments: [{ status: 'reported', amount: 300, payer_id: 'hugo', payer_position: null }],
    })
    render(<TurnCourt turn={match} canCharge={false} charging={null} onCharge={() => {}} />)
    const spots = within(screen.getByRole('list', { name: 'Jugadores' })).getAllByRole('listitem')
    expect(spots.map((spot) => spot.textContent)).toEqual(['AnaDebe $300', 'Libre', 'HugoTransferencia informada', 'Libre'])
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Correr el test y ver que falla**

Run: `npx vitest run tests/unit/components/club/turn-court.test.tsx`
Expected: FAIL (`Failed to resolve import "@/components/club/turn-court"`).

- [ ] **Step 3: Crear `TurnCourt`**

Create `components/club/turn-court.tsx`:

```tsx
import { cn } from '@/lib/cn'
import { chargeLabel, playerLabel, type PlayerShare, type TurnPlayers } from '@/lib/domain/club-home'
import { formatPrice } from '@/lib/domain/format'

const POSITIONS = [1, 2, 3, 4] as const
const SPOT = 'flex h-full min-h-20 flex-col justify-between gap-1 rounded-xl p-2 text-sm'

type SpotProps = {
  canCharge: boolean
  // The position whose confirmation is open: its button steps aside.
  charging: number | null
  onCharge: (position: number) => void
}

// A turn seen from above: two players on top, the net, two below. Same look as the match court (MatchCourt), but
// position and team do not matter here. Each spot says the name and whether the player paid; a share reception can
// charge is a button ("Cobrar $400"), and its confirmation shows under the court (BookingPlayers).
export function TurnCourt({ turn, ...spot }: SpotProps & { turn: Pick<TurnPlayers, 'players'> }) {
  return (
    <ul
      aria-label="Jugadores"
      className="relative grid grid-cols-2 grid-rows-2 gap-x-2 gap-y-5 rounded-2xl bg-court p-2 text-on-court before:absolute before:inset-x-2 before:top-1/2 before:border-t-2 before:border-on-court before:content-['']"
    >
      {POSITIONS.map((position) => {
        const player = turn.players.find((candidate) => candidate.position === position)
        return (
          <li key={position}>
            {player ? (
              <PlayerSpot player={player} {...spot} />
            ) : (
              // An open match's empty spot: dashed, so it never reads as a taken one.
              <div className={cn(SPOT, 'justify-center border-2 border-dashed border-on-court')}>
                <b>Libre</b>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function PlayerSpot({ player, canCharge, charging, onCharge }: SpotProps & { player: PlayerShare }) {
  return (
    <div className={cn(SPOT, 'border border-on-court')}>
      <b className={cn('line-clamp-2 break-words', player.name === null && 'font-normal italic')}>{playerLabel(player)}</b>
      {player.state === 'paid' ? (
        <span className="text-xs font-semibold">Pagó ✓</span>
      ) : player.state === 'reported' ? (
        <span className="text-xs">Transferencia informada</span>
      ) : canCharge && charging !== player.position ? (
        <button
          type="button"
          aria-label={chargeLabel(player)}
          onClick={() => onCharge(player.position)}
          className="min-h-11 rounded-lg bg-accent px-3 font-semibold text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-court"
        >
          Cobrar {formatPrice(player.due)}
        </button>
      ) : (
        <span className="text-xs">Debe {formatPrice(player.due)}</span>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Sumar `layout` a `BookingPlayers`**

En `components/club/booking-players.tsx`, reemplazar:

```tsx
import { playerLabel, type PlayerShare, type TurnPlayers } from '@/lib/domain/club-home'
import { formatPrice } from '@/lib/domain/format'
import type { MemberOption } from '@/lib/domain/members'
import { ChargeChoice, type PayMethods } from './charge-choice'
import { PlayersSheet } from './players-sheet'

export type PlayersActions = { chargeShare: FormAction; chargeRest: FormAction; savePlayers: FormAction }
```

con:

```tsx
import { chargeLabel, playerLabel, type PlayerShare, type TurnPlayers } from '@/lib/domain/club-home'
import { formatPrice } from '@/lib/domain/format'
import type { MemberOption } from '@/lib/domain/members'
import { ChargeChoice, type PayMethods } from './charge-choice'
import { PlayersSheet } from './players-sheet'
import { TurnCourt } from './turn-court'

export type PlayersActions = { chargeShare: FormAction; chargeRest: FormAction; savePlayers: FormAction }
// list: a row per player (the Grilla). court: the four players drawn on a court (the Inicio).
export type PlayersLayout = 'list' | 'court'
```

Reemplazar:

```tsx
  onDone,
  playerExtra,
}: {
  bookingId: string
  turn: TurnPlayers
  methods: PayMethods
  members: MemberOption[]
  actions: PlayersActions
  onDone?: (message: string) => void
  playerExtra?: (player: PlayerShare) => ReactNode
}) {
```

con:

```tsx
  onDone,
  playerExtra,
  layout = 'list',
}: {
  bookingId: string
  turn: TurnPlayers
  methods: PayMethods
  members: MemberOption[]
  actions: PlayersActions
  onDone?: (message: string) => void
  playerExtra?: (player: PlayerShare) => ReactNode
  layout?: PlayersLayout
}) {
```

Reemplazar:

```tsx
  const startCharge = (target: number | 'rest') => {
    setNotice(null)
    setCharging(target)
  }

  return (
    <div className="flex flex-col gap-3">
      <ul aria-label="Jugadores" className="flex flex-col gap-2">
        {turn.players.map((player) => {
          const label = playerLabel(player)
          const title = `Cobrar ${formatPrice(player.due)} a ${label}`
          return (
            <li key={player.position} className="flex flex-col gap-2 rounded-xl border border-border bg-bg p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={cn('font-semibold', player.name === null && 'text-fg-muted')}>{label}</span>
                {player.state === 'paid' ? (
                  <span className="text-sm font-semibold text-court-ink">Pagó</span>
                ) : player.state === 'reported' ? (
                  <span className="text-sm text-accent-ink">Transferencia informada</span>
                ) : canCharge && charging !== player.position ? (
                  <Button variant="secondary" aria-label={title} onClick={() => startCharge(player.position)}>
                    Cobrar {formatPrice(player.due)}
                  </Button>
                ) : null}
              </div>
              {charging === player.position ? (
                <ChargeChoice
                  title={title}
                  fields={{ bookingId, position: String(player.position) }}
                  action={actions.chargeShare}
                  methods={methods}
                  onDone={succeed}
                  onError={fail}
                  onCancel={() => setCharging(null)}
                />
              ) : null}
              {playerExtra?.(player)}
            </li>
          )
        })}
      </ul>
```

con:

```tsx
  const startCharge = (target: number | 'rest') => {
    setNotice(null)
    setCharging(target)
  }
  const shareChoice = (player: PlayerShare) => (
    <ChargeChoice
      title={chargeLabel(player)}
      fields={{ bookingId, position: String(player.position) }}
      action={actions.chargeShare}
      methods={methods}
      onDone={succeed}
      onError={fail}
      onCancel={() => setCharging(null)}
    />
  )
  const chargingPosition = typeof charging === 'number' ? charging : null
  const chargingPlayer = turn.players.find((player) => player.position === chargingPosition)

  return (
    <div className="flex flex-col gap-3">
      {layout === 'court' ? (
        <>
          <TurnCourt turn={turn} canCharge={canCharge} charging={chargingPosition} onCharge={startCharge} />
          {chargingPlayer ? shareChoice(chargingPlayer) : null}
        </>
      ) : (
        <ul aria-label="Jugadores" className="flex flex-col gap-2">
          {turn.players.map((player) => (
            <li key={player.position} className="flex flex-col gap-2 rounded-xl border border-border bg-bg p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={cn('font-semibold', player.name === null && 'text-fg-muted')}>{playerLabel(player)}</span>
                {player.state === 'paid' ? (
                  <span className="text-sm font-semibold text-court-ink">Pagó</span>
                ) : player.state === 'reported' ? (
                  <span className="text-sm text-accent-ink">Transferencia informada</span>
                ) : canCharge && charging !== player.position ? (
                  <Button variant="secondary" aria-label={chargeLabel(player)} onClick={() => startCharge(player.position)}>
                    Cobrar {formatPrice(player.due)}
                  </Button>
                ) : null}
              </div>
              {charging === player.position ? shareChoice(player) : null}
              {playerExtra?.(player)}
            </li>
          ))}
        </ul>
      )}
```

- [ ] **Step 5: Correr los tests y ver que pasan**

Run: `npx vitest run tests/unit/components/club/turn-court.test.tsx tests/unit/components/club/booking-players.test.tsx tests/unit/components/club/occupancy-detail-sheet.test.tsx`
Expected: PASS (la Grilla sigue con `list`: sus tests no cambian).

Run: `npm run typecheck` y `npm run lint`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add components/club/turn-court.tsx components/club/booking-players.tsx tests/unit/components/club/turn-court.test.tsx
git commit -m "feat(inicio): the turn drawn as a court, with each share to charge in its spot

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Las tarjetas de cancha del Inicio y los íconos nuevos

**Files:**
- Modify: `components/ui/icon.tsx`
- Modify: `components/club/court-card.tsx`
- Modify: `app/(club)/club/inicio/page.tsx`
- Test: `tests/unit/components/club/court-card.test.tsx`

- [ ] **Step 1: Escribir los tests que fallan**

Replace the whole `tests/unit/components/club/court-card.test.tsx` with:

```tsx
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CourtList } from '@/components/club/court-card'
import type { FormAction } from '@/components/ui/action-form'
import { courtItems } from '@/lib/domain/club-home'
import { at, COURTS, occupancy, TIMEZONE } from '../../fixtures/grid'

const items = courtItems({
  courts: COURTS,
  occupancies: [
    occupancy('o1', 'court-1', '11:00', '12:30'),
    occupancy('o2', 'court-2', '11:00', '14:00', 'block', 'Clase de menores'),
    { ...occupancy('o3', 'court-2', '14:00', '15:30', 'tournament', 'Copa de la Casa'), tournamentId: 't1' },
  ],
  bookings: [
    {
      id: 'b1',
      occupancy_id: 'o1',
      price: 1200,
      player_id: null,
      guest_name: 'Rodríguez',
      match_id: null,
      player: null,
      match: null,
      players: [],
      payments: [],
    },
  ],
})

function renderList(now: Date) {
  const action = vi.fn<FormAction>(async () => ({ status: 'ok', message: 'Listo.' }))
  render(
    <CourtList
      items={items}
      timezone={TIMEZONE}
      methods={{ cash: true, transfer: true }}
      members={[]}
      actions={{ chargeShare: action, chargeRest: action, savePlayers: action }}
      now={now}
    />,
  )
}

const card = () => screen.getByRole('article', { name: 'Cancha 1, 11:00 a 12:30' })

describe('CourtList', () => {
  it('shows a booking in play as a court with its players and how much is left', () => {
    renderList(at('11:30'))
    expect(within(card()).getByRole('progressbar', { name: 'Tiempo de juego en Cancha 1' })).toHaveAttribute(
      'aria-valuenow',
      '33',
    )
    expect(card()).toHaveTextContent('Faltan 60 min')
    expect(within(card()).getByRole('list', { name: 'Jugadores' })).toHaveTextContent('Rodríguez')
    expect(within(card()).getAllByRole('listitem')).toHaveLength(4)
  })

  it('an upcoming booking says when it starts, without the bar', () => {
    renderList(at('10:15'))
    expect(card()).toHaveTextContent('Empieza 11:00')
    expect(within(card()).queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('a booking that ended says how long ago', () => {
    renderList(at('12:42'))
    expect(within(card()).getByText('Terminó hace 12 min')).toBeInTheDocument()
    expect(within(card()).queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('shows blocks and tournaments as a narrow card with an icon, a tournament with its link', () => {
    renderList(at('07:00'))
    const block = screen.getByText('Cancha 2 · Clase de menores').closest('li')
    expect(block?.querySelector('[data-icon="cancel"]')).not.toBeNull()
    const cup = screen.getByRole('link', { name: 'Cancha 2 · Copa de la Casa' })
    expect(cup).toHaveAttribute('href', '/club/torneos/t1')
    expect(cup.closest('li')?.querySelector('[data-icon="trophy"]')).not.toBeNull()
    expect(screen.getByText('14:00 a 15:30')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Correr el test y ver que falla**

Run: `npx vitest run tests/unit/components/club/court-card.test.tsx`
Expected: FAIL (no "Empieza 11:00", no "Terminó hace 12 min", no `data-icon`).

- [ ] **Step 3: Íconos nuevos**

En `components/ui/icon.tsx`, reemplazar:

```tsx
  bell: (
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </>
  ),
} satisfies
```

con:

```tsx
  bell: (
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </>
  ),
  transfer: (
    <>
      <path d="M4 8h14l-4-4" />
      <path d="M20 16H6l4 4" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3 2 20h20z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  cancel: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6M15 9l-6 6" />
    </>
  ),
} satisfies
```

- [ ] **Step 4: Las tarjetas**

Replace the whole `components/club/court-card.tsx` with:

```tsx
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Icon, type IconName } from '@/components/ui/icon'
import { timeLeft, turnLabel, type CourtEvent, type CourtItem, type CourtTurn } from '@/lib/domain/club-home'
import { timeIn } from '@/lib/domain/format'
import type { MemberOption } from '@/lib/domain/members'
import { BookingPlayers, type PlayersActions } from './booking-players'
import type { PayMethods } from './charge-choice'

export type CourtListProps = {
  items: CourtItem[]
  timezone: string
  methods: PayMethods
  members: MemberOption[]
  actions: PlayersActions
  // Each card says, from it, how much is left, when it starts or how long ago it ended.
  now: Date
}

const EVENT_ICONS: Partial<Record<CourtEvent['occupancyKind'], IconName>> = {
  tournament: 'trophy',
  championship: 'trophy',
  day_use: 'ticket',
  block: 'cancel',
}

export function courtHours(item: Pick<CourtItem, 'startsAt' | 'endsAt'>, timezone: string): string {
  return `${timeIn(item.startsAt, timezone)} a ${timeIn(item.endsAt, timezone)}`
}

// The courts of one Inicio block: a court with its players per booking or match, a narrow card per block,
// tournament or day use.
export function CourtList({ items, timezone, methods, members, actions, now }: CourtListProps) {
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {items.map((item) =>
        item.kind === 'turn' ? (
          <li key={item.id}>
            <CourtTurnCard
              turn={item}
              now={now}
              timezone={timezone}
              methods={methods}
              members={members}
              actions={actions}
            />
          </li>
        ) : (
          <li key={item.id} className="md:col-span-2">
            <EventCard event={item} hours={courtHours(item, timezone)} />
          </li>
        ),
      )}
    </ul>
  )
}

function EventCard({ event, hours }: { event: CourtEvent; hours: string }) {
  const name = `${event.courtName} · ${event.label}`
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-2">
      <Icon name={EVENT_ICONS[event.occupancyKind] ?? 'clock'} className="text-accent-ink" />
      {event.href ? (
        <Link href={event.href} className="inline-flex min-h-11 items-center font-semibold text-accent-ink underline">
          {name}
        </Link>
      ) : (
        <span className="font-semibold">{name}</span>
      )}
      <span className="ml-auto text-sm text-fg-muted">{hours}</span>
    </div>
  )
}

export function CourtTurnCard({
  turn,
  now,
  timezone,
  methods,
  members,
  actions,
}: {
  turn: CourtTurn
  now: Date
  timezone: string
  methods: PayMethods
  members: MemberOption[]
  actions: PlayersActions
}) {
  const hours = courtHours(turn, timezone)
  const time = now.getTime()
  const playing = turn.startsAt.getTime() <= time && time < turn.endsAt.getTime()
  const ended = turn.endsAt.getTime() <= time
  const label = turnLabel(turn, now, timezone)
  const progress = playing ? timeLeft(turn, now) : null
  return (
    <Card role="article" aria-label={`${turn.courtName}, ${hours}`} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-xl font-bold uppercase">{turn.courtName}</h3>
        <span className="text-sm text-fg-muted">
          {hours}
          {turn.isMatch ? ' · Partido abierto' : ''}
        </span>
      </div>
      {progress ? (
        <div className="flex flex-col gap-1">
          <div
            role="progressbar"
            aria-label={`Tiempo de juego en ${turn.courtName}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percentDone}
            aria-valuetext={progress.text}
            className="h-2 overflow-hidden rounded-full bg-bg"
          >
            <div className="h-full rounded-full bg-accent" style={{ width: `${progress.percentDone}%` }} />
          </div>
          <p className="text-sm text-fg-muted">{progress.text}</p>
        </div>
      ) : ended ? (
        <p className="self-start rounded-full border border-accent px-3 py-1 text-sm font-semibold text-accent-ink">
          {label}
        </p>
      ) : (
        <p className="text-sm text-fg-muted">{label}</p>
      )}
      <BookingPlayers
        bookingId={turn.bookingId}
        turn={turn}
        methods={methods}
        members={members}
        actions={actions}
        layout="court"
      />
    </Card>
  )
}
```

- [ ] **Step 5: La página pasa `now` a todas las listas**

En `app/(club)/club/inicio/page.tsx`, reemplazar:

```tsx
    actions: { chargeShare, chargeRest, savePlayers: saveBookingPlayers },
  }
```

con:

```tsx
    actions: { chargeShare, chargeRest, savePlayers: saveBookingPlayers },
    now,
  }
```

Reemplazar:

```tsx
          <CourtList items={playing} now={now} {...list} />
```

con:

```tsx
          <CourtList items={playing} {...list} />
```

- [ ] **Step 6: Correr los tests y ver que pasan**

Run: `npx vitest run tests/unit/components/club`
Expected: PASS.

Run: `npm run typecheck` y `npm run lint`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add components/ui/icon.tsx components/club/court-card.tsx "app/(club)/club/inicio/page.tsx" tests/unit/components/club/court-card.test.tsx
git commit -m "feat(inicio): each turn as a court with its time, events as narrow cards with an icon

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: "Pendientes de cobro" que se abren a la cancha

**Files:**
- Create: `components/club/pending-list.tsx`
- Test: `tests/unit/components/club/pending-list.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

Create `tests/unit/components/club/pending-list.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PendingList } from '@/components/club/pending-list'
import type { FormAction } from '@/components/ui/action-form'
import { courtItems, type CourtTurn } from '@/lib/domain/club-home'
import { at, COURTS, occupancy, TIMEZONE } from '../../fixtures/grid'

const turns = courtItems({
  courts: COURTS,
  occupancies: [occupancy('o1', 'court-2', '08:00', '09:30')],
  bookings: [
    {
      id: 'b1',
      occupancy_id: 'o1',
      price: 1200,
      player_id: null,
      guest_name: 'Rodríguez',
      match_id: null,
      player: null,
      match: null,
      players: [],
      payments: [{ status: 'confirmed', amount: 300, payer_id: null, payer_position: 1 }],
    },
  ],
}).filter((item): item is CourtTurn => item.kind === 'turn')

function renderList() {
  const action = vi.fn<FormAction>(async () => ({ status: 'ok', message: 'Listo.' }))
  render(
    <PendingList
      turns={turns}
      timezone={TIMEZONE}
      methods={{ cash: true, transfer: true }}
      members={[]}
      actions={{ chargeShare: action, chargeRest: action, savePlayers: action }}
      now={at('11:00')}
    />,
  )
}

describe('PendingList', () => {
  it('shows a compact row: court, hours, who booked and what is owed', () => {
    renderList()
    const row = screen.getByRole('listitem')
    expect(row).toHaveTextContent('Cancha 2')
    expect(row).toHaveTextContent('08:00 a 09:30')
    expect(row).toHaveTextContent('Rodríguez')
    expect(row).toHaveTextContent('Debe $900')
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('Cobrar opens the court of that booking, and Cerrar folds it', async () => {
    renderList()
    const open = screen.getByRole('button', { name: 'Cobrar Cancha 2, 08:00 a 09:30' })
    expect(open).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(open)
    const card = screen.getByRole('article', { name: 'Cancha 2, 08:00 a 09:30' })
    expect(card).toHaveTextContent('Terminó hace 90 min')
    expect(within(card).getByRole('button', { name: 'Cobrar todo lo que falta ($900)' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar Cancha 2, 08:00 a 09:30' }))
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Correr el test y ver que falla**

Run: `npx vitest run tests/unit/components/club/pending-list.test.tsx`
Expected: FAIL (`Failed to resolve import "@/components/club/pending-list"`).

- [ ] **Step 3: Implementar**

Create `components/club/pending-list.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { playerLabel, type CourtTurn } from '@/lib/domain/club-home'
import { formatPrice } from '@/lib/domain/format'
import { courtHours, CourtTurnCard, type CourtListProps } from './court-card'

// "Pendientes de cobro": a compact row per booking played today that still owes, ended more than 30 minutes ago.
// "Cobrar" opens the same court as En cancha ahora, right under its row, to charge each share or the rest.
export function PendingList({ turns, ...court }: Omit<CourtListProps, 'items'> & { turns: CourtTurn[] }) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <ul className="flex flex-col gap-2">
      {turns.map((turn) => {
        const hours = courtHours(turn, court.timezone)
        const isOpen = open === turn.id
        const holder = turn.isMatch || !turn.players[0] ? 'Partido abierto' : playerLabel(turn.players[0])
        return (
          <li key={turn.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-border bg-surface px-4 py-2">
              <span className="font-semibold">{turn.courtName}</span>
              <span className="text-sm text-fg-muted">{hours}</span>
              <span className="min-w-0 flex-1 truncate">{holder}</span>
              <span className="font-semibold text-accent-ink">Debe {formatPrice(turn.restDue)}</span>
              <Button
                variant={isOpen ? 'ghost' : 'secondary'}
                aria-expanded={isOpen}
                aria-controls={`pendiente-${turn.id}`}
                aria-label={`${isOpen ? 'Cerrar' : 'Cobrar'} ${turn.courtName}, ${hours}`}
                onClick={() => setOpen(isOpen ? null : turn.id)}
              >
                {isOpen ? 'Cerrar' : 'Cobrar'}
              </Button>
            </div>
            {isOpen ? (
              <div id={`pendiente-${turn.id}`}>
                <CourtTurnCard turn={turn} {...court} />
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
```

- [ ] **Step 4: Correr el test y ver que pasa**

Run: `npx vitest run tests/unit/components/club/pending-list.test.tsx`
Expected: PASS.

Run: `npm run typecheck` y `npm run lint`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add components/club/pending-list.tsx tests/unit/components/club/pending-list.test.tsx
git commit -m "feat(inicio): pending charges as compact rows that open the court

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: La tarjeta de transferencias y "El día"

**Files:**
- Create: `components/club/transfers-card.tsx`
- Create: `components/club/home-day.tsx`
- Test: `tests/unit/components/club/transfers-card.test.tsx`
- Test: `tests/unit/components/club/home-day.test.tsx`

- [ ] **Step 1: Escribir los tests que fallan**

Create `tests/unit/components/club/transfers-card.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TransfersCard } from '@/components/club/transfers-card'

describe('TransfersCard', () => {
  it('says how many transfers wait, their money and age, and goes to Cobros to review them', () => {
    render(
      <TransfersCard
        summary={{ count: 11, total: 13800, text: '11 transferencias por confirmar · $13.800', age: 'la más vieja hace 2 h' }}
      />,
    )
    const card = screen.getByRole('region', { name: 'Transferencias por confirmar' })
    expect(card).toHaveTextContent('11 transferencias por confirmar · $13.800')
    expect(card).toHaveTextContent('la más vieja hace 2 h')
    expect(screen.getByRole('link', { name: 'Revisar →' })).toHaveAttribute('href', '/club/cobros#transferencias')
  })
})
```

Create `tests/unit/components/club/home-day.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HomeDay } from '@/components/club/home-day'
import type { DayOccupancy } from '@/lib/domain/club-home'
import { at, TIMEZONE } from '../../fixtures/grid'

const occupancy: DayOccupancy = {
  percent: 68,
  free: 7,
  slots: [
    { courtName: 'Cancha 1', startsAt: at('17:30'), label: '17:30 Cancha 1' },
    { courtName: 'Cancha 2', startsAt: at('19:00'), label: '19:00 Cancha 2' },
  ],
}
const card = (name: string) => screen.getByRole('article', { name })

describe('HomeDay', () => {
  it('Ocupación: the day in a bar, the free slots left and the next ones, with a link to the Grilla', () => {
    render(<HomeDay occupancy={occupancy} alerts={[]} cancellations={[]} timezone={TIMEZONE} />)
    const ocupacion = card('Ocupación')
    expect(within(ocupacion).getByRole('progressbar', { name: 'Ocupación del día' })).toHaveAttribute('aria-valuenow', '68')
    expect(ocupacion).toHaveTextContent('68 % ocupado · 7 turnos libres')
    expect(
      within(within(ocupacion).getByRole('list', { name: 'Próximos horarios libres' }))
        .getAllByRole('listitem')
        .map((chip) => chip.textContent),
    ).toEqual(['17:30 Cancha 1', '19:00 Cancha 2'])
    expect(within(ocupacion).getByRole('link', { name: 'Ver la Grilla' })).toHaveAttribute('href', '/club/grilla')
  })

  it('Avisos: each with its icon, number and link', () => {
    render(
      <HomeDay
        occupancy={occupancy}
        alerts={[
          { kind: 'forming', count: 2, href: '/club/grilla', text: '2 partidos armándose · faltan 3 jugadores' },
          { kind: 'tournament', count: null, href: '/club/torneos/t1', text: 'Torneo Copa de la Casa en juego' },
        ]}
        cancellations={[]}
        timezone={TIMEZONE}
      />,
    )
    const avisos = card('Avisos')
    expect(within(avisos).getByRole('link', { name: '2 partidos armándose · faltan 3 jugadores' })).toHaveAttribute(
      'href',
      '/club/grilla',
    )
    expect(within(avisos).getByRole('link', { name: 'Torneo Copa de la Casa en juego' })).toHaveAttribute(
      'href',
      '/club/torneos/t1',
    )
    expect(avisos.querySelector('[data-icon="users"]')).not.toBeNull()
  })

  it('Cancelaciones: who and what to give back, with a link to Cobros only when there is money', () => {
    render(
      <HomeDay
        occupancy={occupancy}
        alerts={[]}
        cancellations={[
          { bookingId: 'b1', courtName: 'Cancha 1', startsAt: at('18:30'), holder: 'Rodríguez', refund: 1600 },
          { bookingId: 'b2', courtName: 'Cancha 2', startsAt: at('20:00'), holder: 'Martina', refund: 0 },
        ]}
        timezone={TIMEZONE}
      />,
    )
    const cancelaciones = card('Cancelaciones de hoy')
    const rows = within(cancelaciones).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      'Cancha 1 · 18:30 · RodríguezA devolver $1.600',
      'Cancha 2 · 20:00 · Martina',
    ])
    expect(within(cancelaciones).getByRole('link', { name: 'Devolver en Cobros' })).toHaveAttribute(
      'href',
      '/club/cobros#devolver',
    )
  })

  it('says so when nothing is pending, nothing was cancelled or nothing is free', () => {
    render(<HomeDay occupancy={{ percent: 100, free: 0, slots: [] }} alerts={[]} cancellations={[]} timezone={TIMEZONE} />)
    expect(card('Ocupación')).toHaveTextContent('No quedan horarios libres hoy.')
    expect(card('Avisos')).toHaveTextContent('Nada pendiente.')
    expect(card('Cancelaciones de hoy')).toHaveTextContent('Sin cancelaciones hoy.')
    expect(screen.queryByRole('link', { name: 'Devolver en Cobros' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `npx vitest run tests/unit/components/club/transfers-card.test.tsx tests/unit/components/club/home-day.test.tsx`
Expected: FAIL (no se resuelven los imports).

- [ ] **Step 3: La tarjeta de transferencias**

Create `components/club/transfers-card.tsx`:

```tsx
import Link from 'next/link'
import { buttonClasses } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import type { TransfersSummary } from '@/lib/domain/club-home'

// The top of the Inicio when players reported transfers: how many, how much, how old the oldest is, and "Revisar"
// to confirm them in Cobros. The Inicio does not confirm them.
export function TransfersCard({ summary }: { summary: TransfersSummary }) {
  return (
    <section
      aria-label="Transferencias por confirmar"
      className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-accent bg-surface p-4"
    >
      <Icon name="transfer" className="size-6 text-accent-ink" />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="font-semibold">{summary.text}</p>
        <p className="text-sm text-fg-muted">{summary.age}</p>
      </div>
      <Link href="/club/cobros#transferencias" className={buttonClasses({ variant: 'primary' })}>
        Revisar →
      </Link>
    </section>
  )
}
```

- [ ] **Step 4: "El día"**

Create `components/club/home-day.tsx`:

```tsx
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { Icon, type IconName } from '@/components/ui/icon'
import {
  occupancyLine,
  type AlertKind,
  type Cancellation,
  type DayOccupancy,
  type HomeAlert,
} from '@/lib/domain/club-home'
import { formatPrice, timeIn } from '@/lib/domain/format'

const ALERT_ICONS: Record<AlertKind, IconName> = {
  forming: 'users',
  waiting: 'clock',
  tournament: 'trophy',
  championship: 'trophy',
  day_use: 'ticket',
}

const LINK = 'inline-flex min-h-11 items-center font-semibold text-accent-ink underline'

function DayCard({ id, icon, title, children }: { id: string; icon: IconName; title: string; children: ReactNode }) {
  return (
    <Card role="article" aria-labelledby={id} className="flex flex-col gap-3">
      <h3 id={id} className="flex items-center gap-2 font-display text-xl font-bold uppercase">
        <Icon name={icon} className="text-accent-ink" />
        {title}
      </h3>
      {children}
    </Card>
  )
}

// "El día": how full the courts are and the next free slots, what asks for something, and today's cancellations.
// One column on a phone, three on a desktop.
export function HomeDay({
  occupancy,
  alerts,
  cancellations,
  timezone,
}: {
  occupancy: DayOccupancy
  alerts: HomeAlert[]
  cancellations: Cancellation[]
  timezone: string
}) {
  const line = occupancyLine(occupancy)
  const refunds = cancellations.some((cancellation) => cancellation.refund > 0)
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <DayCard id="dia-ocupacion" icon="grid" title="Ocupación">
        <div
          role="progressbar"
          aria-label="Ocupación del día"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={occupancy.percent}
          aria-valuetext={line}
          className="h-2 overflow-hidden rounded-full bg-bg"
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${occupancy.percent}%` }} />
        </div>
        <p className="font-semibold">{line}</p>
        {occupancy.slots.length > 0 ? (
          <ul aria-label="Próximos horarios libres" className="flex flex-wrap gap-2">
            {occupancy.slots.map((slot) => (
              <li key={slot.label} className="rounded-full border border-border px-3 py-1 text-sm font-semibold">
                {slot.label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-muted">No quedan horarios libres hoy.</p>
        )}
        <Link href="/club/grilla" className={LINK}>
          Ver la Grilla
        </Link>
      </DayCard>

      <DayCard id="dia-avisos" icon="alert" title="Avisos">
        {alerts.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {alerts.map((alert) => (
              <li key={alert.text} className="flex items-center gap-2">
                <Icon name={ALERT_ICONS[alert.kind]} className="text-accent-ink" />
                {alert.count !== null ? (
                  <span aria-hidden="true" className="font-display text-xl font-bold">
                    {alert.count}
                  </span>
                ) : null}
                <Link href={alert.href} className={LINK}>
                  {alert.text}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-fg-muted">Nada pendiente.</p>
        )}
      </DayCard>

      <DayCard id="dia-cancelaciones" icon="cancel" title="Cancelaciones de hoy">
        {cancellations.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {cancellations.map((cancellation) => (
              <li key={cancellation.bookingId} className="flex flex-col">
                <span>
                  {cancellation.courtName} · {timeIn(cancellation.startsAt, timezone)} · {cancellation.holder}
                </span>
                {cancellation.refund > 0 ? (
                  <span className="text-sm font-semibold text-accent-ink">A devolver {formatPrice(cancellation.refund)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-fg-muted">Sin cancelaciones hoy.</p>
        )}
        {refunds ? (
          <Link href="/club/cobros#devolver" className={LINK}>
            Devolver en Cobros
          </Link>
        ) : null}
      </DayCard>
    </div>
  )
}
```

- [ ] **Step 5: Correr los tests y ver que pasan**

Run: `npx vitest run tests/unit/components/club/transfers-card.test.tsx tests/unit/components/club/home-day.test.tsx`
Expected: PASS.

Run: `npm run typecheck` y `npm run lint`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add components/club/transfers-card.tsx components/club/home-day.tsx tests/unit/components/club/transfers-card.test.tsx tests/unit/components/club/home-day.test.tsx
git commit -m "feat(inicio): the transfers card and the three cards of El día

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Los datos y la pantalla nueva

**Files:**
- Modify: `lib/data/payments.ts`
- Modify: `lib/data/club-home.ts`
- Modify: `app/(club)/club/inicio/page.tsx`
- Modify: `lib/domain/club-home.ts` (sale `todayLines`, `TodayLine`, `transfersLine`)
- Test: `tests/unit/lib/domain/club-home.test.ts`

(no test nuevo: `loadClubHome` y la página no tienen tests unitarios en el repo; la lógica que suman ya está testeada en las Tasks 1 y 2, y la pantalla la cubre el e2e de la Task 8.)

- [ ] **Step 1: Exportar el select de Cobros**

En `lib/data/payments.ts`, reemplazar:

```ts
const BOOKING_SELECT =
```

con:

```ts
// A booking with its court, holder, match spots and payments (OverviewBooking): Cobros, and the Inicio's
// cancellations (lib/data/club-home.ts).
export const BOOKING_SELECT =
```

- [ ] **Step 2: `loadClubHome`**

Replace the whole `lib/data/club-home.ts` with:

```ts
import 'server-only'
import type { Club } from '@/lib/auth/viewer'
import {
  alerts,
  cancellationsToday,
  competitionsToday,
  courtItems,
  dayOccupancy,
  transfersCard,
  type Cancellation,
  type CourtItem,
  type DayOccupancy,
  type HomeAlert,
  type TransfersSummary,
  type TurnBookingRow,
} from '@/lib/domain/club-home'
import { toOccupancy } from '@/lib/domain/grid'
import { addDays, localDateOf, zonedTime } from '@/lib/domain/time'
import { createClient } from '@/lib/supabase/server'
import { loadDayGrid } from './day'
import { loadInside } from './day-use'
import { loadMatches } from './matches'
import { BOOKING_SELECT } from './payments'
import { loadDayWaits } from './waitlist'

export type ClubHomeData = {
  items: CourtItem[]
  alerts: HomeAlert[]
  transfers: TransfersSummary | null
  occupancy: DayOccupancy
  cancellations: Cancellation[]
}

// booking_players reaches profiles through player_id and created_by: the hint picks the player.
const TURN_SELECT =
  'id, occupancy_id, price, player_id, guest_name, match_id, player:profiles!bookings_player_id_fkey(display_name), match:open_matches!bookings_match_id_fkey(slots:match_slots(position, player_id, player:profiles(display_name))), players:booking_players(position, player_id, name, player:profiles!booking_players_player_id_fkey(display_name)), payments(status, amount, payer_id, payer_position)'

// If supabase-js infers a slightly different shape for the embeds, adjust this type to match; never cast.
type HomeBookingRow = TurnBookingRow & { occupancy_id: string | null }

// Everything the Inicio shows, read in parallel with the staff session: the club's day (occupancies, bookings with
// their players and payments, notes), the day's grid (occupancy and free slots), today's cancelled bookings, forming
// matches, day use inside, waits and reported transfers.
export async function loadClubHome(club: Club, viewerId: string, now = new Date()): Promise<ClubHomeData> {
  const supabase = await createClient()
  const today = localDateOf(now, club.timezone)
  const dayStart = zonedTime(today, 0, club.timezone)
  const dayEnd = zonedTime(addDays(today, 1), 0, club.timezone)
  const from = dayStart.toISOString()
  const to = dayEnd.toISOString()

  const [courts, occupancies, bookings, notes, reported, cancelled, grid, forming, inside, waits] = await Promise.all([
    supabase.from('courts').select('id, name').eq('club_id', club.id).order('sort_order'),
    supabase
      .from('court_occupancy')
      .select('id, court_id, kind, starts_at, ends_at, tournament_id, championship_id')
      .eq('club_id', club.id)
      .lt('starts_at', to)
      .gt('ends_at', from),
    supabase
      .from('bookings')
      .select(TURN_SELECT)
      .eq('club_id', club.id)
      .eq('status', 'confirmed')
      .lt('starts_at', to)
      .gt('ends_at', from),
    supabase.rpc('occupancy_notes', { p_club_id: club.id, p_from: from, p_to: to }),
    supabase.from('payments').select('amount, created_at').eq('club_id', club.id).eq('status', 'reported'),
    supabase
      .from('bookings')
      .select(BOOKING_SELECT)
      .eq('club_id', club.id)
      .eq('status', 'cancelled')
      .gte('starts_at', from)
      .lt('starts_at', to),
    loadDayGrid(club, today, { userId: viewerId, audience: 'staff' }, now),
    loadMatches(club, { from: dayStart, to: dayEnd }, ['forming']),
    loadInside(club, today),
    loadDayWaits(club, today),
  ])
  if (courts.error) throw courts.error
  if (occupancies.error) throw occupancies.error
  if (bookings.error) throw bookings.error
  if (notes.error) throw notes.error
  if (reported.error) throw reported.error
  if (cancelled.error) throw cancelled.error

  const noteById = new Map((notes.data ?? []).map((row) => [row.id, row.note]))
  const day = occupancies.data.map((row) => toOccupancy({ ...row, note: noteById.get(row.id) ?? null }, 'staff'))
  const turns: HomeBookingRow[] = bookings.data

  return {
    items: courtItems({ courts: courts.data, occupancies: day, bookings: turns }),
    alerts: alerts({
      forming,
      competitions: competitionsToday(day),
      inside: inside.length,
      waiting: waits.length,
    }),
    transfers: transfersCard(reported.data, now),
    occupancy: dayOccupancy(grid, now),
    cancellations: cancellationsToday(cancelled.data),
  }
}
```

- [ ] **Step 3: La página**

Replace the whole `app/(club)/club/inicio/page.tsx` with:

```tsx
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { CourtList } from '@/components/club/court-card'
import { HomeDay } from '@/components/club/home-day'
import { PendingList } from '@/components/club/pending-list'
import { TransfersCard } from '@/components/club/transfers-card'
import { AutoRefresh } from '@/components/live/auto-refresh'
import { LiveOccupancy } from '@/components/live/live-occupancy'
import { chargeRest, chargeShare, saveBookingPlayers } from '@/lib/actions/booking-charges'
import { requireStaff } from '@/lib/auth/viewer'
import { loadClubHome } from '@/lib/data/club-home'
import { loadMemberOptions } from '@/lib/data/members'
import { homeSections } from '@/lib/domain/club-home'
import { timeIn } from '@/lib/domain/format'

export const metadata: Metadata = { title: 'Inicio' }

function HomeSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="font-display text-2xl font-bold uppercase">
        {title}
      </h2>
      {children}
    </section>
  )
}

// Reception's and the admin's first screen: transfers to review, the courts in play (and the ones that just ended
// and still owe), what comes next, what is still owed today and the day. It renders again when an occupancy changes
// (Realtime) and every minute, so bookings move from Próximos to En cancha and to Pendientes on their own.
export default async function ClubHomePage() {
  const viewer = await requireStaff('/club/inicio')
  const { club } = viewer
  const now = new Date()
  const [home, members] = await Promise.all([loadClubHome(club, viewer.userId, now), loadMemberOptions(club.id)])
  const { playing, recent, upcoming, pending, next } = homeSections(home.items, now)
  const inPlay = [...playing, ...recent]
  const list = {
    timezone: club.timezone,
    methods: { cash: club.accepts_cash, transfer: club.accepts_transfer },
    members,
    actions: { chargeShare, chargeRest, savePlayers: saveBookingPlayers },
    now,
  }

  return (
    <>
      <LiveOccupancy clubId={club.id} />
      <AutoRefresh seconds={60} />

      {home.transfers ? <TransfersCard summary={home.transfers} /> : null}

      <HomeSection id="en-cancha" title="En cancha ahora">
        {inPlay.length > 0 ? (
          <CourtList items={inPlay} {...list} />
        ) : (
          <p className="text-fg-muted">
            No hay canchas en juego ahora.
            {next ? ` Próximo turno: ${next.courtName} a las ${timeIn(next.startsAt, club.timezone)}.` : ''}
          </p>
        )}
      </HomeSection>

      <HomeSection id="proximos" title="Próximos">
        {upcoming.length > 0 ? (
          <CourtList items={upcoming} {...list} />
        ) : (
          <p className="text-fg-muted">No empieza nada en la próxima hora y media.</p>
        )}
      </HomeSection>

      <HomeSection id="pendientes" title="Pendientes de cobro">
        {pending.length > 0 ? (
          <PendingList turns={pending} {...list} />
        ) : (
          <p className="text-fg-muted">Lo jugado hoy está cobrado.</p>
        )}
      </HomeSection>

      <HomeSection id="el-dia" title="El día">
        <HomeDay
          occupancy={home.occupancy}
          alerts={home.alerts}
          cancellations={home.cancellations}
          timezone={club.timezone}
        />
      </HomeSection>
    </>
  )
}
```

- [ ] **Step 4: Sacar `todayLines` y `transfersLine` del dominio**

En `lib/domain/club-home.ts`, reemplazar:

```ts
export type Competition = { kind: 'tournament' | 'championship'; id: string; name: string }
export type TodayLine = { text: string; href: string }
```

con:

```ts
export type Competition = { kind: 'tournament' | 'championship'; id: string; name: string }
```

Reemplazar (todo el bloque, desde el comentario de "Lo que pasa hoy" hasta el final de `transfersLine`):

```ts
// "Lo que pasa hoy": short lines with a link; nothing for what does not happen.
export function todayLines(input: {
  forming: number
  competitions: Competition[]
  inside: number
  waiting: number
}): TodayLine[] {
  const lines: TodayLine[] = []
  if (input.forming > 0) {
    lines.push({ text: plural(input.forming, 'partido armándose', 'partidos armándose'), href: '/club/grilla' })
  }
  for (const competition of input.competitions) {
    lines.push(
      competition.kind === 'tournament'
        ? { text: `Torneo ${competition.name}`, href: `/club/torneos/${competition.id}` }
        : { text: `Campeonato ${competition.name}`, href: `/club/torneos/campeonatos/${competition.id}` },
    )
  }
  if (input.inside > 0) lines.push({ text: `${input.inside} en el club hoy`, href: '/club/day-use' })
  if (input.waiting > 0) lines.push({ text: `${input.waiting} esperando turno hoy`, href: '/club/grilla' })
  return lines
}

// "3 transferencias por confirmar · $4.800", or nothing.
export function transfersLine(totals: { count: number; total: number }): string | null {
  if (totals.count === 0) return null
  return `${plural(totals.count, 'transferencia por confirmar', 'transferencias por confirmar')} · ${formatPrice(totals.total)}`
}

```

con nada (una línea vacía queda entre `const plural = …` y `// Avisos: …`).

- [ ] **Step 5: Sacar sus tests**

En `tests/unit/lib/domain/club-home.test.ts`, reemplazar:

```ts
  timeLeft,
  todayLines,
  transfersCard,
  transfersLine,
  turnLabel,
```

con:

```ts
  timeLeft,
  transfersCard,
  turnLabel,
```

Reemplazar:

```ts
describe('Lo que pasa hoy', () => {
  it('lists the tournaments and championships of the day once each', () => {
```

con:

```ts
describe('competitionsToday', () => {
  it('lists the tournaments and championships of the day once each', () => {
```

Reemplazar (el final del test de `competitionsToday`, los dos tests de `todayLines` y el `describe` de `transfersLine`):

```ts
      { kind: 'championship', id: 'c1', name: 'Apertura' },
    ])
  })

  it('writes a short line with a link for each thing that happens', () => {
    expect(
      todayLines({
        forming: 2,
        competitions: [
          { kind: 'tournament', id: 't1', name: 'Copa de la Casa' },
          { kind: 'championship', id: 'c1', name: 'Apertura' },
        ],
        inside: 8,
        waiting: 3,
      }),
    ).toEqual([
      { text: '2 partidos armándose', href: '/club/grilla' },
      { text: 'Torneo Copa de la Casa', href: '/club/torneos/t1' },
      { text: 'Campeonato Apertura', href: '/club/torneos/campeonatos/c1' },
      { text: '8 en el club hoy', href: '/club/day-use' },
      { text: '3 esperando turno hoy', href: '/club/grilla' },
    ])
  })

  it('says one match in singular and leaves out what does not happen', () => {
    expect(todayLines({ forming: 1, competitions: [], inside: 0, waiting: 0 })).toEqual([
      { text: '1 partido armándose', href: '/club/grilla' },
    ])
    expect(todayLines({ forming: 0, competitions: [], inside: 0, waiting: 0 })).toEqual([])
  })
})

describe('transfersLine', () => {
  it('counts the transfers to confirm and their money', () => {
    expect(transfersLine({ count: 3, total: 4800 })).toBe('3 transferencias por confirmar · $4.800')
    expect(transfersLine({ count: 1, total: 1200 })).toBe('1 transferencia por confirmar · $1.200')
    expect(transfersLine({ count: 0, total: 0 })).toBeNull()
  })
})
```

con:

```ts
      { kind: 'championship', id: 'c1', name: 'Apertura' },
    ])
  })
})
```

- [ ] **Step 6: Correr todo**

Run: `npx vitest run tests/unit/lib/domain/club-home.test.ts tests/unit/components/club`
Expected: PASS.

Run: `npm run typecheck` y `npm run lint`
Expected: sin errores. Si `tsc` marca que `cancelled.data` no encaja con `OverviewBooking[]`, el select no es el mismo que el de Cobros: revisar que se use `BOOKING_SELECT` (nunca castear).

Run: `npx vitest run`
Expected: toda la suite en verde.

- [ ] **Step 7: Verlo en el navegador**

Run: `npm run dev:local` y, con un usuario de recepción, abrir `/club/inicio` en ancho de celular (375 px) y de escritorio. Revisar: la tarjeta de transferencias arriba (si hay), cada turno como cancha con la red en el medio, botones "Cobrar $…" de al menos 44 px de alto, la confirmación debajo de la cancha, "Terminó hace N min" en las recién terminadas, "Pendientes de cobro" que se abre a la cancha y las tres tarjetas de "El día" (una columna en el celular, tres en escritorio). La Grilla (`/club/grilla`) sigue igual.

- [ ] **Step 8: Commit**

```bash
git add lib/data/payments.ts lib/data/club-home.ts "app/(club)/club/inicio/page.tsx" lib/domain/club-home.ts tests/unit/lib/domain/club-home.test.ts
git commit -m "feat(inicio): the new Inicio, recent courts, pending rows, transfers card and El día

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: El e2e del Inicio

**Files:**
- Modify: `tests/e2e/support/club-home.ts`
- Modify: `tests/e2e/club-home.spec.ts`

- [ ] **Step 1: El turno recién terminado en el soporte**

Replace the whole `tests/e2e/support/club-home.ts` with:

```ts
import { daySlots } from '../../../lib/domain/slots'
import { localDateOf } from '../../../lib/domain/time'
import { adminClient, clubRow, type TestUser } from './admin'

export type InsertedBooking = { bookingId: string; courtName: string }
export type PlayingBooking = InsertedBooking & { time: string }

// A booking of that period on the first active court that is free then, inserted directly (the service role skips
// the rules that keep a booking from starting in the past or off the grid).
async function insertBooking(user: TestUser, period: { startsAt: Date; endsAt: Date }, price: number): Promise<InsertedBooking> {
  const admin = adminClient()
  const club = await clubRow(admin)
  const { data: courts, error } = await admin
    .from('courts')
    .select('id, name')
    .eq('club_id', club.id)
    .eq('is_active', true)
    .order('sort_order')
  if (error) throw error
  const range = `[${period.startsAt.toISOString()},${period.endsAt.toISOString()})`
  for (const court of courts) {
    const occupancy = await admin
      .from('court_occupancy')
      .insert({ club_id: club.id, court_id: court.id, kind: 'booking', period: range, created_by: user.id })
      .select('id')
      .single()
    if (occupancy.error?.code === '23P01') continue
    if (occupancy.error) throw occupancy.error

    const booking = await admin
      .from('bookings')
      .insert({
        club_id: club.id,
        court_id: court.id,
        period: range,
        player_id: user.id,
        source: 'online',
        price,
        occupancy_id: occupancy.data.id,
        created_by: user.id,
      })
      .select('id')
      .single()
    if (booking.error) throw booking.error
    return { bookingId: booking.data.id, courtName: court.name }
  }
  throw new Error('No hay ninguna cancha libre en ese horario: corré node scripts/demo-data.mjs --clean')
}

// A booking of the slot being played right now. Null outside the club's hours, or when the slot ends within 5
// minutes (it would leave "En cancha ahora" in the middle of the test).
export async function insertPlayingBooking(user: TestUser, price = 1200): Promise<PlayingBooking | null> {
  const club = await clubRow(adminClient())
  const now = new Date()
  const schedule = { timezone: club.timezone, opensAt: club.opens_at, closesAt: club.closes_at, slotMinutes: club.slot_minutes }
  const slot = daySlots(schedule, localDateOf(now, club.timezone)).find(
    (candidate) => candidate.startsAt <= now && candidate.endsAt.getTime() - now.getTime() > 5 * 60_000,
  )
  if (!slot) return null
  return { ...(await insertBooking(user, slot, price)), time: slot.label }
}

// An hour-long booking that ended 10 minutes ago, off the grid on purpose: while it owes, it stays in "En cancha
// ahora" for 20 more minutes. Null when it would not have started today.
export async function insertRecentBooking(user: TestUser, price = 1200): Promise<InsertedBooking | null> {
  const club = await clubRow(adminClient())
  const now = new Date()
  const endsAt = new Date(Math.floor(now.getTime() / 60_000) * 60_000 - 10 * 60_000)
  const startsAt = new Date(endsAt.getTime() - 60 * 60_000)
  if (localDateOf(startsAt, club.timezone) !== localDateOf(now, club.timezone)) return null
  return insertBooking(user, { startsAt, endsAt }, price)
}

export async function paymentsOf(bookingId: string) {
  const { data, error } = await adminClient()
    .from('payments')
    .select('method, amount, status, payer_position, receipt_path')
    .eq('booking_id', bookingId)
    .order('amount')
  if (error) throw error
  return data
}
```

- [ ] **Step 2: Adaptar el spec y sumar el turno recién terminado**

En `tests/e2e/club-home.spec.ts`, reemplazar:

```ts
import { insertPlayingBooking, paymentsOf } from './support/club-home'
```

con:

```ts
import { insertPlayingBooking, insertRecentBooking, paymentsOf } from './support/club-home'
```

Reemplazar (en la cancha del Inicio el estado dice "Pagó ✓"; en la Grilla sigue "Pagó"):

```ts
  await expect(players.getByText('Pagó', { exact: true })).toHaveCount(4)
```

con:

```ts
  await expect(players.getByText('Pagó ✓', { exact: true })).toHaveCount(4)
```

Reemplazar:

```ts
  await expect(detail.getByRole('list', { name: 'Jugadores' })).toContainText(partner.name)
  await expect(detail.getByText('Pagó', { exact: true })).toHaveCount(4)
})
```

con:

```ts
  await expect(detail.getByRole('list', { name: 'Jugadores' })).toContainText(partner.name)
  await expect(detail.getByText('Pagó', { exact: true })).toHaveCount(4)
})

test('a court that just ended stays in play while it owes, and leaves once it is paid', async ({ page }) => {
  const holder = await createMember({ name: 'Paula Reciente E2E', prefix: 'inicio-reciente' })
  const reception = await createMember({ name: 'Recepción Reciente E2E', prefix: 'inicio-recepcion-reciente', role: 'reception' })
  const recent = await insertRecentBooking(holder)
  test.skip(recent === null, 'El turno de hace un rato habría empezado ayer')
  if (!recent) return

  // Ended 10 minutes ago and owes everything: still in "En cancha ahora", without the bar, not in Pendientes.
  await signInWithMagicLink(page, reception.email, '/club/inicio')
  const card = page.getByRole('region', { name: 'En cancha ahora' }).getByRole('article').filter({ hasText: holder.name })
  await expect(card).toContainText(recent.courtName)
  await expect(card).toContainText(/Terminó hace 1\d min/)
  await expect(card.getByRole('progressbar')).toHaveCount(0)
  await expect(card.getByRole('list', { name: 'Jugadores' }).getByRole('listitem')).toHaveCount(4)
  await expect(page.getByRole('region', { name: 'Pendientes de cobro' })).not.toContainText(holder.name)

  // Everything in cash from the court: once paid, it leaves the Inicio.
  await card.getByRole('button', { name: 'Cobrar todo lo que falta ($1.200)' }).click()
  await card.getByRole('group', { name: 'Cobrar todo lo que falta ($1.200)' }).getByRole('button', { name: 'Efectivo' }).click()
  await expect(card).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Pendientes de cobro' })).not.toContainText(holder.name)
  expect(await paymentsOf(recent.bookingId)).toEqual([
    { method: 'cash', amount: 1200, status: 'confirmed', payer_position: null, receipt_path: null },
  ])
})
```

Nota: la regex `/Terminó hace 1\d min/` lleva una barra invertida. Escribir este reemplazo con la herramienta Edit, no con heredoc ni `sed`.

- [ ] **Step 3: Correr el e2e**

Requiere Docker con Supabase local (`npx supabase status`) y el puerto 3000 libre (cerrar cualquier `next dev` abierto: la config no reutiliza servidores).

Run: `npx playwright test tests/e2e/club-home.spec.ts`
Expected: 2 passed. El primero se saltea si el club está cerrado; el segundo, si se corre antes de la 01:10 hora del club. Si "No hay ninguna cancha libre", correr `node scripts/demo-data.mjs --clean` y repetir.

Si el segundo test falla porque la tarjeta no desaparece: revisar que `chargeRest` llame a `revalidateBookings()` (revalida `/` con `layout`) y que `homeSections` deje fuera los turnos con `restDue === 0`.

Run: `npm run lint` y `npm run typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/support/club-home.ts tests/e2e/club-home.spec.ts
git commit -m "test(inicio): e2e, charge from the court and a just-ended court leaves once paid

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Cierre

**Files:**
- Modify: `docs/features/inicio-cancha/plan.md`

- [ ] **Step 1: Suite completa**

Run: `npx vitest run`, `npm run typecheck` y `npm run lint`
Expected: todo en verde.

- [ ] **Step 2: Marcar el plan como hecho**

En `docs/features/inicio-cancha/plan.md`, reemplazar:

```
status: ready
```

con:

```
status: done
```

- [ ] **Step 3: Commit**

```bash
git add docs/features/inicio-cancha/plan.md
git commit -m "docs: the Inicio court is done

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Revisión**

Correr `/team-setup:discipline-check` sobre la rama. El PR se abre desde GitHub (`gh` no está instalado).

---

## Cobertura del diseño

| Diseño | Task |
| --- | --- |
| Turno en juego como cancha con 4 lugares, "Pagó ✓", "Cobrar $400", "Transferencia informada", "Jugador 3", "Libre" | 3, 4 |
| La confirmación debajo de la cancha; pie con "Completar/Cambiar jugadores" y "Cobrar todo lo que falta" | 3 |
| Terminadas hace poco: siguen 30 min con "Terminó hace 12 min" y desaparecen al pagar | 1, 4, 7, 8 |
| Próximos con "Empieza 14:30", sin barra | 1, 4 |
| Pendientes de cobro como filas que se abren a la cancha; vacío "Lo jugado hoy está cobrado." | 1, 5, 7 |
| Bloqueos, torneos, campeonatos y day use como tarjeta angosta con ícono | 1, 4 |
| Vacío "No hay canchas en juego ahora. Próximo turno: …" | 7 |
| Tarjeta de transferencias con cantidad, total, antigüedad y "Revisar" a Cobros | 2, 6, 7 |
| El día: Ocupación (barra, libres, hasta 4 chips, link a la Grilla) | 2, 6, 7 |
| El día: Avisos (partidos armándose y jugadores que faltan, espera, campeonatos y torneos, day use; "Nada pendiente.") | 2, 6, 7 |
| El día: Cancelaciones de hoy con "A devolver" y link a Cobros; "Sin cancelaciones hoy." | 2, 6, 7 |
| `BookingPlayers` con `layout`; la Grilla sigue con `list` | 3 |
| Íconos transferencia, alerta, reloj (ya existía) y cancelar | 4 |
| Sin cambios en la base; datos en paralelo (grilla, canceladas, `created_at`) | 7 |

## Plan revisions

- 2026-11-17: el código de las Tasks 1 a 7 se aplicó entero en un worktree descartable y pasó Vitest completo (188 archivos, 1046 tests), `tsc` y `lint`. El e2e (Task 8) pasó `tsc` y `lint`, pero no se corrió: Turbopack no acepta el `node_modules` enlazado del worktree. El worktree se borró.

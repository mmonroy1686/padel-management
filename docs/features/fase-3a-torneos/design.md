---
feature: fase-3a-torneos
type: design
status: approved
date: 2026-09-30
branch: feat/fase-3a-torneos
references: ../../plan-general.md, ../../prototipo.html, ../fase-2-partidos/design.md
---

# fase-3a-torneos — design

## Purpose

Torneos americanos cortos en Rustic: el club crea el torneo y bloquea canchas, los jugadores se anotan solos (filtro por categoría y género), recepción arma el fixture, carga los resultados y todos ven el ranking. Es la primera mitad de la fase 3 del plan general; el day use queda para `fase-3b-day-use`.

## Principles

- **Escrituras solo por funciones de Postgres**, como en las fases 1 y 2: RPCs `security definer`, `search_path = ''`, errores con `private.fail(code)` traducidos en `lib/domain/errors.ts`. Nadie escribe directo en las tablas nuevas.
- **El fixture se arma en la base** (`start_tournament`), en la misma transacción que pone el torneo en juego. Nadie puede mandar un fixture inventado y se prueba con pgTAP.
- **El ranking se calcula en TypeScript** (función pura en `lib/domain/`) a partir de los partidos; no hace falta guardarlo.
- **Club único** (`rustic`): sin flujos entre clubes.

## Decisiones (brainstorm)

| Tema | Decisión |
| --- | --- |
| Alcance | Solo americano (cada ronda cambia la pareja). Day use en otra fase. |
| Cobro | Igual que las reservas: queda debiendo, paga por transferencia con comprobante o efectivo, recepción confirma. Aparece en Cobros. |
| Cupo | Máximo, múltiplo de 4, de 8 a 16. Se juega con 8, 12 o 16 anotados; si no, recepción suma invitados o saca a alguien. |
| Resultados | Solo recepción o admin. Se carga un número (pareja A); B = total − A. |
| Cierre | A mano: "Cerrar inscripción" (se puede reabrir) y "Armar fixture". Baja del jugador solo con inscripción abierta; si pagó, va a "Pagos a devolver". |

## Modelo de datos

- **`tournaments`**: `club_id`, nombre, `starts_at` (timestamptz), canchas (`court_ids uuid[]`), cupo (`max_players` 8, 12 o 16), `points_per_game` (default 24), `round_minutes` (default 20), `rounds` (default 7, a lo sumo n−1), `category_min` y `category_max`, `type` (`match_type`: male, female, mixed), `price`, `status` (`registration`, `closed`, `in_progress`, `finished`, `cancelled`), `created_by`, `created_at`.
- **`tournament_entries`**: `tournament_id`, `player_id` **o** `guest_name` (uno de los dos, como `bookings`), `created_at`. Un jugador una sola vez por torneo.
- **`tournament_games`**: `tournament_id`, `round`, `wave`, `court_id`, `team_a` y `team_b` (dos `entry_id` cada uno), `score_a` (null hasta cargarse; `score_b = points_per_game − score_a`).
- **Duración**: `rounds × waves × round_minutes`, con `waves = ceil((jugadores / 4) / canchas)`. Al crear se calcula con el cupo máximo.
- **Ocupación**: al crear, una `court_occupancy` de tipo `tournament` por cancha, del inicio al fin calculado, vinculada al torneo. El exclusion constraint impide choques; si choca, `courts_busy`. Al cancelar se borran.
- **Pagos**: `payments.booking_id` pasa a nullable y se agrega `tournament_entry_id`, con un check de que hay exactamente uno de los dos. Lo que debe una inscripción es el precio menos los pagos confirmados. Reutiliza informar transferencia, confirmar, rechazar, cobrar en efectivo y devolver.

## Funciones (RPC)

**Jugador**

- `join_tournament(tournament)`: inscripción abierta, hay lugar (`tournament_full`), categoría en rango (`category_mismatch`), género (`type_mismatch`), no anotado (`already_in_tournament`), sin otra reserva o partido superpuesto (`busy_at_that_time`). Crea la inscripción; el pago queda pendiente.
- `leave_tournament(tournament)`: solo con inscripción abierta. Si pagó, el pago confirmado queda para devolver.
- `report_tournament_transfer(entry, amount, receipt)`: reusa el Storage de comprobantes.

**Recepción y admin**

- `create_tournament(...)`: valida datos (cupo, rondas, horario dentro del club, canchas activas) y bloquea las canchas.
- `add_tournament_guest(tournament, name)` y `remove_tournament_entry(entry)`: hasta que empieza (`registration` o `closed`). Sacar a quien pagó deja el pago para devolver.
- `close_tournament_registration` y `reopen_tournament_registration`.
- `start_tournament(tournament)`: estado `closed` y 8, 12 o 16 anotados (`not_enough_players`). Arma el fixture con el método del círculo (cada jugador comparte pareja con cada otro a lo sumo una vez, n−1 rondas, recortado a `rounds`), mezcla el orden inicial al azar, asigna cancha y tanda por partido y pasa a `in_progress`.
- `record_tournament_score(game, score_a)`: 0 ≤ score_a ≤ puntos (`invalid_score`), solo `in_progress`; se puede corregir.
- `finish_tournament`: todos los partidos cargados (`scores_missing`).
- `cancel_tournament`: libera canchas; pagos confirmados quedan para devolver.
- Cobro en efectivo por inscripción desde Cobros o desde la gestión del torneo.

**Errores nuevos**: `tournament_closed`, `tournament_full`, `already_in_tournament`, `not_enough_players`, `scores_missing`, `invalid_score`, `courts_busy`. Se reusan `category_mismatch`, `type_mismatch`, `busy_at_that_time`, `forbidden`, `invalid_state`.

**Permisos (RLS)**: los miembros del club leen torneos, inscripciones y partidos; la escritura es solo por las RPCs. `anon` no ejecuta nada.

## Ranking

Función pura: por jugador suma puntos, partidos jugados, ganados y diferencia. Orden: puntos, ganados, diferencia. Con Realtime sobre `tournament_games` el detalle se refresca al cargar un resultado.

## Pantallas

**Jugador**

- Nueva pestaña **Torneos** (ícono trofeo). "Mis reservas" se une con Inicio para mantener 5 pestañas: Inicio lista tus próximas reservas y partidos con su acción (pagar, cancelar); `/reservas` redirige a Inicio.
- **Lista** `/torneos`: tarjeta con fecha y horario (inicio a fin), nombre, categorías, género, canchas, rondas y puntos, precio; etiqueta "5 de 8", "En juego" o "Finalizado"; "Inscribirme, $400" o el motivo por el que no se puede.
- **Detalle** `/torneos/[id]`: inscripción abierta: anotados, anotarme o darme de baja, pagar. En juego: fixture por ronda (parejas, cancha, puntos) y ranking en vivo. Finalizado: ranking final. Compartir por WhatsApp.
- **Inicio**: acceso "Torneos: N con inscripción abierta".

**Club**

- Nueva pestaña **Torneos** en el panel.
- **Nuevo americano**: formulario con defaults (8 jugadores, 24 puntos, 20 min, 7 rondas); muestra la hora de fin y avisa canchas ocupadas.
- **Gestión** `/club/torneos/[id]`: anotados con estado de pago (cobrar en efectivo), sacar, agregar invitado; botones Cerrar inscripción, Reabrir, Armar fixture, Finalizar, Cancelar.
- **Resultados**: por partido un campo con los puntos de la pareja A; los de B se completan solos.
- **Grilla**: bloque color torneo con el nombre.
- **Cobros**: inscripciones impagas en "Sin cobrar" y a devolver en "A devolver", con el nombre del torneo.

## Tests

- **pgTAP**: esquema y RLS; creación con ocupación y choque; inscripción (categoría, género, cupo, repetido, superposición); baja con devolución; invitados; fixture con 8, 12 y 16 (cada par de jugadores es pareja a lo sumo una vez, nadie juega dos veces en la misma tanda, canchas por tanda); carga y corrección; finalizar; cancelar; pagos de inscripción; `anon` no ejecuta nada.
- **Vitest**: ranking y desempates, duración y hora de fin, tarjetas y motivo de no poder anotarse, formulario, carga de resultados, validación de entrada de las acciones.
- **Playwright**: recepción crea un americano, jugadores e invitados completan 8, arma el fixture, carga resultados, se ve el ranking.

## Fuera de alcance

Ranking entre torneos, parejas fijas, categoría suma, resultados cargados por jugadores, cierre automático de inscripción.

## Open questions

- Precio y reglas reales de Rustic para sus americanos (defaults: $400, 24 puntos, 20 min por ronda).

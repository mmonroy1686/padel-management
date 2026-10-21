---
feature: inicio-del-club
type: design
status: approved
date: 2026-10-20
branch: feat/inicio-del-club
references: ../fase-1-reservas/design.md, ../fase-2-partidos/design.md, ../lista-de-espera/design.md
---

# inicio-del-club — design

## Purpose

Darle a recepción y al admin un inicio del panel con lo que importa en el momento: qué canchas se están jugando ahora, quiénes juegan y quién pagó, con el botón para cobrarle a cada uno ahí mismo. Hoy `/club` redirige a la Grilla y en un turno normal paga uno solo, el que reservó; en la realidad cada jugador paga su parte al llegar o al terminar. Esta feature suma una pestaña "Inicio" y los jugadores del turno, cada uno con su parte.

## Principles

- **Reglas en Postgres**: jugadores y cobros por funciones `security definer`, `search_path = ''`, `private.fail(code)`, solo staff del club. Las mismas reglas valen desde el Inicio y desde la Grilla.
- **Un solo bloque de jugadores y cobro**: el Inicio y el detalle de la Grilla usan el mismo componente; turnos normales y partidos abiertos se muestran con el mismo formato.
- **Lógica pura y testeada**: qué turno va en cada bloque según la hora y el estado de pago de cada jugador viven en `lib/domain/club-home.ts`, con Vitest.
- **Rustic es el club piloto**; todo sigue llevando `club_id`.

## Decisiones (brainstorm)

| Tema | Decisión |
| --- | --- |
| Ubicación | Pestaña "Inicio" nueva, primera del panel y destino de `/club`, para admin y recepción. La Grilla no cambia de lugar. |
| Bloques | En cancha ahora; Próximos; Pendientes de cobro; Lo que pasa hoy. Sin "el día en números" (ya está en la Grilla). |
| Cobro | Dividido entre jugadores: hasta 4 por turno, cada uno con su parte. Efectivo o transferencia ("me transfirió", confirmada por recepción, sin comprobante). |
| Jugadores | El 1 es quien reservó; recepción completa los 2 a 4 buscando un socio o escribiendo un nombre, o los deja sin nombre. |

## La pantalla

`app/(club)/club/inicio/page.tsx`; `/club` redirige ahí. De arriba a abajo:

1. **En cancha ahora**: una tarjeta por turno en juego.
   - Cancha, horario y una barra de cuánto falta para terminar.
   - Los 4 jugadores, cada uno con "Pagó" o "Cobrar $400"; "Completar jugadores" si faltan nombres; "Cobrar todo lo que falta ($1.200)" al pie.
   - Bloqueos, partidos de torneo o campeonato y day use: una línea sin cobro ("Cancha 3 · Copa de la Casa", "Cancha 2 · Clase de menores").
2. **Próximos**: los turnos que empiezan en la próxima hora y media, con el mismo formato.
3. **Pendientes de cobro**: los turnos de hoy ya terminados con algo sin pagar, cada uno con su "Cobrar"; y una línea "3 transferencias por confirmar · $4.800" con link a Cobros.
4. **Lo que pasa hoy**: líneas cortas con link: partidos armándose ("2 partidos armándose"), el torneo o campeonato en juego, day use ("8 en el club hoy"), lista de espera ("3 esperando turno hoy").

- **Vacíos**: sin turnos en juego, "No hay canchas en juego ahora" y el próximo turno; cada bloque vacío dice lo suyo en una línea o no se muestra (Lo que pasa hoy).
- **Actualización**: se refresca sola cuando cambia una ocupación (como la Grilla, con Realtime) y cada minuto, para que los turnos pasen de Próximos a En cancha y a Pendientes.

## Jugadores del turno

- **Tabla `booking_players`**: `booking_id`, `club_id`, `position` (2 a 4), `player_id` (socio, opcional) o `name` (solo nombre, opcional), única por `(booking_id, position)`. RLS: solo staff del club lee; escritura solo por función.
- **El jugador 1** es quien reservó (`bookings.player_id` o `guest_name`); no se repite en la tabla. Una posición sin fila se muestra como "Jugador 3".
- **Partidos abiertos**: no usan la tabla; sus jugadores son los lugares del partido. El Inicio los muestra con el mismo formato.
- **`set_booking_players(booking_id, players jsonb)`**: guarda los jugadores 2 a 4 (cada uno `{position, player_id}` o `{position, name}` o vacío). No cambia ni saca a un jugador que ya pagó (`already_paid`); no acepta el mismo socio dos veces en el turno ni repetir al que reservó; el socio tiene que ser miembro del club; turno confirmado (`invalid_state`).
- **Hoja "Completar jugadores"**: 3 campos; cada uno busca entre los socios del club o acepta un nombre.

## Partes y cobro

- **Parte** = precio / 4; el resto del redondeo va al jugador 1 (la regla de los partidos).
- **`payments.payer_position`** (1 a 4, opcional) dice de quién es un pago de un turno normal.
- **Pagos sin posición** (el turno pagado entero desde la app, una transferencia del que reservó, o pagos de antes de este cambio) cubren lo que falta en general: el estado por jugador cuenta primero los pagos con su posición; si el total pagado del turno llega al precio, todos figuran "Pagó".
- **`charge_booking_share(booking_id, position, method)`**: cobra lo que le falta a ese jugador. `method` = `cash` o `transfer`; la transferencia de recepción queda `confirmed`, sin comprobante, confirmada por quien la cargó. Respeta `accepts_cash` / `accepts_transfer` (`method_disabled`); nada que cobrar → `already_paid`; turno no confirmado → `invalid_state`.
- **`charge_booking_rest(booking_id, method)`**: "Cobrar todo lo que falta": un pago sin posición por el saldo del turno.
- **Partidos abiertos**: el cobro por jugador de hoy suma la opción de transferencia con la misma regla.
- Todo lo cobrado aparece en Cobros como hoy (efectivo y transferencias confirmadas).

## Cobro en pantalla

- "Cobrar $400" abre una confirmación chica: "Efectivo" y "Me transfirió" (solo el medio habilitado si hay uno solo).
- "Cobrar todo lo que falta ($1.200)" al pie de la tarjeta, con la misma confirmación.
- Después de cobrar, el jugador pasa a "Pagó" y la tarjeta se actualiza sin recargar.
- Si otro de recepción cobró justo antes, el error se ve en la tarjeta ("Ya estaba pagado.") y la tarjeta se refresca.
- El detalle de un turno en la Grilla usa el mismo bloque de jugadores y cobro.

## Datos

- `lib/data/club-home.ts`: en paralelo, los turnos de hoy con sus jugadores y pagos, los partidos de hoy, el resumen de Cobros que ya existe, day use, lista de espera y torneos y campeonatos del día.
- `lib/domain/club-home.ts` (puro): con la hora, decide qué va en En cancha ahora, Próximos (próximos 90 minutos) y Pendientes (terminado hoy con saldo), y arma las partes y el estado de cada jugador.

## Tests

- **pgTAP**: `set_booking_players` (solo staff del club, socio repetido, repetir al que reservó, socio de otro club, no cambiar a quien pagó, turno cancelado); `charge_booking_share` (división con el resto al jugador 1, sin cobrar dos veces, `already_paid`, medio deshabilitado, transferencia confirmada sin comprobante); `charge_booking_rest` y pagos sin posición; partidos con transferencia; otro club no puede.
- **Vitest**: qué turno va en cada bloque según la hora (justo al empezar, justo al terminar, 90 minutos); estado por jugador con pagos con y sin posición; tarjetas, hoja de jugadores y confirmación de cobro; las líneas de "Lo que pasa hoy".
- **Playwright**: recepción entra al Inicio, ve el turno en juego, completa los jugadores, cobra la parte de uno en efectivo y "todo lo que falta" por transferencia; la tarjeta queda pagada y en Cobros aparece.

## Fuera de alcance

- Que el jugador sume a sus compañeros al reservar.
- Que cada jugador pague su parte desde la app.
- Propinas, extras o venta de pelotas.
- "El día en números" en el Inicio (sigue en la Grilla).

## Open questions

- Ninguna.

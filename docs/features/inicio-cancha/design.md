---
feature: inicio-cancha
type: design
status: done
date: 2026-11-17
branch: feat/inicio-cancha
references: ../inicio-del-club/design.md, ../marca-del-club/design.md
---

# inicio-cancha — design

## Purpose

Mejorar el Inicio del panel del club (`/club/inicio`) después de usarlo con datos reales:

- Los turnos en juego se ven como una cancha de pádel con los jugadores adentro.
- Las canchas que terminaron hace poco se pueden seguir cobrando desde ahí.
- La línea suelta de transferencias pasa a ser una tarjeta clara.
- "Lo que pasa hoy" se reemplaza por información que ayuda a gestionar el día.

## Principles

- Sin cambios en la base: todo sale de lo que el Inicio y la Grilla ya leen. El cobro sigue por `charge_booking_share` y `charge_booking_rest`.
- La lógica es pura y testeada en `lib/domain/club-home.ts`, con Vitest: qué va en cada bloque, cancelaciones, horarios libres y avisos.
- Mismo lenguaje visual que la cancha de los partidos ([match-court.tsx](../../../components/matches/match-court.tsx)): `bg-court`, la red en el medio, dos jugadores por lado. No importa la posición ni el equipo.
- Mobile first. Botones de al menos 44 px. El estado se dice con texto además del color ("Pagó", "$400"). Contraste de 4.5:1 con la marca del club.

## Decisiones (brainstorm 2026-11-17)

| Tema | Decisión |
| --- | --- |
| Turno en juego | Cancha dibujada con 4 lugares: el nombre y "Pagó ✓", "Cobrar $400" o "Transferencia informada". Un lugar sin nombre dice "Jugador 3". |
| Terminados hace poco | Siguen en "En cancha ahora" hasta 30 minutos después de terminar, si deben algo, con "Terminó hace 12 min". Al pagar todos, desaparecen. |
| Pendientes más viejos | "Pendientes de cobro" muestra los de hoy terminados hace más de 30 min con deuda, como filas compactas que se abren a la misma cancha para cobrar. |
| Transferencias | Tarjeta destacada arriba de todo: "11 transferencias por confirmar · $13.800 · la más vieja hace 2 h" y el botón "Revisar", que va a Cobros. Solo aparece si hay alguna. |
| Lo que pasa hoy | Se reemplaza por "El día": ocupación y turnos libres, avisos que piden acción y cancelaciones de hoy. |

## La pantalla, de arriba a abajo

1. **Tarjeta de transferencias**, si hay: ícono, cantidad y total, cuánto hace de la más vieja y "Revisar →".
2. **En cancha ahora**: una cancha por turno en juego, más las terminadas en los últimos 30 min que deben algo.
   - Encabezado: cancha, horario y "Faltan 34 min" con barra; o "Terminó hace 12 min" con un distintivo.
   - La cancha: dos lugares arriba, la red, dos abajo. Cada lugar muestra el nombre (nombre de pila y apellido si entra), y debajo "Pagó ✓" en texto chico o un botón "Cobrar $400". En un partido abierto, los lugares vacíos dicen "Libre".
   - Al tocar "Cobrar $400", la confirmación (Efectivo / Me transfirió) aparece debajo de la cancha.
   - Pie: "Completar jugadores" o "Cambiar jugadores" y "Cobrar todo lo que falta ($1.200)".
   - Bloqueos, campeonatos, torneos y day use: una tarjeta angosta con ícono, nombre, horario y link, sin cancha.
   - Vacío: "No hay canchas en juego ahora. Próximo turno: Cancha 2 a las 17:30."
3. **Próximos** (próximos 90 minutos): la misma cancha, sin barra, con "Empieza 14:30". Permite completar jugadores y cobrar por adelantado.
4. **Pendientes de cobro**: filas con cancha, horario, quién reservó y "Debe $1.200". El botón "Cobrar" abre la cancha de ese turno. Vacío: "Lo jugado hoy está cobrado."
5. **El día**, con tres tarjetas en grilla (una columna en el celular, tres en escritorio):
   - **Ocupación**: "68 % ocupado · 7 turnos libres" con barra, y los próximos horarios libres como chips ("17:30 Cancha 1", "19:00 Cancha 2", hasta 4). Link a la Grilla.
   - **Avisos**: solo lo que pide acción, cada uno con ícono, número y link. "2 partidos armándose · faltan 3 jugadores", "3 esperando turno hoy", "Campeonato Copa de la Casa en juego", "8 en el club (day use)". Vacío: "Nada pendiente."
   - **Cancelaciones de hoy**: los turnos de hoy cancelados (cancha, horario, quién) con "A devolver $1.600" si había un pago confirmado. Si hay algo para devolver, link a Cobros. Vacío: "Sin cancelaciones hoy."

## Lógica (lib/domain/club-home.ts)

- `homeSections(items, now)` agrega `recent`: turnos terminados en los últimos `RECENT_MINUTES = 30` con `restDue > 0`. `pending` queda solo con los terminados antes. La página arma "En cancha ahora" con `playing` y `recent`.
- `turnLabel`: "Faltan 34 min", "Terminó hace 12 min" o "Empieza 14:30".
- `cancellationsToday(rows)`: cancelados hoy y lo que hay que devolver (los pagos confirmados), con la misma regla que `refundsDue`.
- `freeSlotsAhead(grid, now, limit)`: los próximos huecos libres del día, en orden de hora y cancha.
- `alerts(input)`: reemplaza `todayLines`. Devuelve `{ kind, text, href, count }` y suma cuántos jugadores faltan en los partidos que se están armando.
- `transfersCard(rows, now)`: cantidad, total y antigüedad de la más vieja. Reemplaza `transfersLine`.

## Datos (lib/data/club-home.ts)

- Ya lee los turnos, ocupaciones, partidos que se arman, day use y espera.
- Suma en paralelo:
  - La grilla del día con `loadDayGrid` (ocupación y horarios libres).
  - Las reservas canceladas hoy, con sus pagos y la cancha.
  - El `created_at` de las transferencias informadas.

## Componentes

- `components/club/turn-court.tsx` (nuevo): la cancha con los 4 lugares. Los lugares son botones cuando se puede cobrar.
- `BookingPlayers` suma `layout: 'list' | 'court'`. La Grilla sigue con `list` y el Inicio usa `court`. La lógica de cobro, la hoja de jugadores y los avisos de error son los mismos.
- `components/club/home-day.tsx` (nuevo): las tres tarjetas de "El día".
- `components/club/transfers-card.tsx` (nuevo).
- Íconos nuevos en `components/ui/icon.tsx` cuando falten: transferencia, alerta, reloj y cancelar.

## Tests

- **Vitest, dominio**:
  - Recientes: justo al terminar, a los 30 y a los 31 minutos, y pagado todo.
  - `turnLabel`.
  - Cancelaciones con y sin pago.
  - Horarios libres (pasados excluidos y el límite).
  - Avisos (vacíos, plural, jugadores que faltan).
  - Tarjeta de transferencias (antigüedad).
- **Vitest, componentes**:
  - La cancha (4 lugares, "Pagó", el botón de cobrar abre la confirmación, partido con lugares libres).
  - Las tarjetas de "El día".
  - La tarjeta de transferencias.
- **Playwright**: el e2e del Inicio que ya existe se adapta. Cobra desde la cancha y, al pagar todo, una cancha terminada hace poco desaparece.

## Fuera de alcance

- Confirmar transferencias desde el Inicio (sigue en Cobros).
- La caja del día (cobrado contra por cobrar).
- Cambios en la Grilla.

## Open questions

- Ninguna.

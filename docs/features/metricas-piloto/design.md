---
feature: metricas-piloto
type: design
status: approved
date: 2026-11-25
branch: feat/metricas-piloto
references: ../../handoff/2026-11-24-auditoria.md (corte D)
---

# metricas-piloto: diseño

## Para qué

El piloto tiene que dejar números para vender el producto a otros clubes: cuántas reservas hace el jugador solo, qué tan llenas están las canchas, cuánto se cancela y cuántos turnos rescata la lista de espera. Todavía no hace falta pantalla (los reportes del dueño son la etapa 2): son consultas SQL que Miguel corre cada semana en el SQL Editor de Supabase. Además, recepción puede marcar «No vino» sobre una reserva pasada, para medir los faltazos (aprobado por Miguel el 24/11).

## Principios

- **Solo lectura y por club.** Cada consulta recibe el `club_id` en un solo lugar, al principio, y no escribe nada.
- **La semana es la del club.** Lunes a domingo en `clubs.timezone`. Cada consulta cuenta lo que *empieza* en la semana: el turno, la cancelación según su turno, el cobro según cuándo se confirmó.
- **El agente no se conecta a producción.** Las consultas se prueban contra el seed local (`npm run demo:data`), y Miguel las corre en producción.

## Las consultas (`docs/piloto/metricas.sql`)

Un bloque al principio fija el club y las semanas:

```sql
-- Cambiá el slug y la cantidad de semanas. Todo lo demás sale solo.
with params as (select id as club_id, timezone from clubs where slug = 'rustic'), weeks as (...)
```

| # | Métrica | Fuente | Cómo se cuenta |
| --- | --- | --- | --- |
| 1 | Reservas por origen | `bookings` confirmadas | `online` (las hizo el jugador) contra `reception`, con porcentaje |
| 2 | Ocupación por cancha y franja | `court_occupancy` y el horario del club | Horas ocupadas sobre horas abiertas, por cancha activa. Franjas: **mañana** (apertura a 14:00), **tarde** (14:00 a 19:00) y **noche** (19:00 al cierre). Cuentan reservas, turnos fijos, partidos, torneos y day use; **los bloqueos no cuentan como ocupación** |
| 3 | Cancelaciones | `bookings` canceladas | Total y tardías, es decir las canceladas dentro de `cancellation_notice_hours` antes del turno |
| 4 | Turnos recuperados | `slot_holds` reclamadas | Los turnos que se liberaron, se le guardaron a alguien de la lista de espera y esa persona los reservó |
| 5 | Jugadores activos y nuevos | reservas, partidos e inscripciones a torneos y campeonatos | Activos: los que tienen al menos una actividad en la semana. Nuevos: los que se sumaron al club esa semana (`club_members.created_at`) |
| 6 | Cobros por medio | `payments` confirmados | Monto y cantidad en efectivo, transferencia y POS; las devoluciones aparte |
| 7 | Faltazos | `bookings.no_show_at` | Reservas marcadas «No vino», y su porcentaje sobre las reservas ya jugadas |

Cada consulta deja en un comentario un ejemplo del resultado contra el seed local.

## «No vino»

- **Modelo:** columnas `no_show_at timestamptz` y `no_show_by uuid` en `bookings`, en vez de un valor nuevo de `booking_status`. Faltar no es lo mismo que cancelar: el turno estuvo ocupado y se cobra igual. Además, cada función que mira `status = 'confirmed'` (grilla, cobros, límites) sigue igual sin tocarla.
- **RPC** `mark_no_show(p_booking_id uuid, p_no_show boolean)`, solo para staff (recepción y admin) del club.
  - Falla con `invalid_state` si la reserva está cancelada o todavía no empezó.
  - Con `false`, deshace la marca (por si se tocó por error).
  - No cambia ni pagos ni ocupación.
- **UI:** en el detalle de la reserva de la grilla del club (`occupancy-detail-sheet`), cuando el turno ya empezó, aparece el botón «No vino». Una vez marcada, el detalle muestra «Marcada: no vino» con el botón «Deshacer».
- **Tests:** pgTAP del RPC (staff sí, jugador no, cancelada o futura no, deshacer), unitarios del botón y una consulta en `metricas.sql`.
- **Esfuerzo:** unas 3 a 4 horas.

## Qué queda afuera

- Una pantalla de métricas.
- Mandar los números por mail.
- Faltazos en partidos abiertos y torneos: solo en reservas de cancha.

## Decisiones de Miguel (25/11)

- Diseño aprobado, con «No vino».
- Franjas: mañana hasta las 14:00, tarde de 14:00 a 19:00, noche desde las 19:00.
- La ocupación cuenta solo canchas activas.
